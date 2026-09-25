import { assertNotLocked, clearFailures, recordFailure } from './loginThrottle.service.js';
import { User } from '../models/User.js';
import { Business } from '../models/Business.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';
import { generateOpaqueToken, hashToken } from '../utils/token.js';
import { normalizePhone } from '../utils/phone.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { sendEmailVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from './email.service.js';
import { runInBackground } from '../utils/background.js';
import { disconnectUser } from '../config/socket.js';
import { audit } from './audit.service.js';
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const issueSession = (user) => ({
    token: signAccessToken({ sub: String(user._id), tv: user.tokenVersion ?? 0 }),
    user: user.toJSON(),
});
export async function register(input) {
    const existing = await User.exists({ email: input.email });
    if (existing)
        throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    const user = await User.create({
        name: input.name,
        email: input.email,
        phone: input.phone ? normalizePhone(input.phone) : undefined,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER',
    });
    runInBackground('welcome email', () => sendWelcomeEmail(user.email, user.name));
    await issueEmailVerification(user);
    await audit({ action: 'USER_REGISTERED', entity: 'User', entityId: user._id, userId: user._id });
    return issueSession(user);
}
export async function login(input, req) {
    await assertNotLocked(input.email);
    const user = await User.findOne({ email: input.email }).select('+passwordHash +tokenVersion');
    const valid = await verifyPassword(input.password, user?.passwordHash);
    // Same message for unknown email / wrong password / disabled account, and all of them count towards the lock.
    if (!user || !valid || !user.isActive) {
        await recordFailure(input.email);
        throw new UnauthorizedError('Invalid email or password');
    }
    await clearFailures(input.email);
    user.lastLoginAt = new Date();
    await user.save();
    await audit({ action: 'LOGIN', entity: 'User', entityId: user._id, userId: user._id, req });
    return issueSession(user);
}
export async function getProfile(userId, impersonatedBy) {
    const user = await User.findById(userId);
    if (!user)
        throw new NotFoundError('User not found');
    const businesses = user.businessIds.length
        ? await Business.find({ _id: { $in: user.businessIds } })
            .select('name slug logo status timezone currency')
            .lean()
        : [];
    return { user: user.toJSON(), businesses, impersonation: impersonatedBy ? { by: impersonatedBy } : null };
}
/** Ends an impersonation session and hands back a fresh token for the original super admin. */
export async function endImpersonation(superAdminId, targetUserId, req) {
    const admin = await User.findById(superAdminId).select('+tokenVersion');
    if (!admin || !admin.isActive || admin.role !== 'SUPER_ADMIN')
        throw new UnauthorizedError('Original session is no longer valid');
    await audit({
        action: 'ADMIN_IMPERSONATION_ENDED',
        entity: 'User',
        entityId: targetUserId,
        userId: superAdminId,
        req,
        metadata: { originalSuperAdminId: superAdminId, targetAdminId: targetUserId },
    });
    return issueSession(admin);
}
export async function forgotPassword(email) {
    // Always resolves silently so the response cannot be used to discover registered emails.
    const user = await User.findOne({ email, isActive: true });
    if (!user)
        return;
    await PasswordResetToken.deleteMany({ userId: user._id, purpose: 'PASSWORD_RESET' });
    const { token, tokenHash } = generateOpaqueToken();
    await PasswordResetToken.create({ userId: user._id, tokenHash, purpose: 'PASSWORD_RESET', expiresAt: new Date(Date.now() + RESET_TTL_MS) });
    // Sent in the background so the response time does not reveal whether the address is registered.
    runInBackground('password reset email', () => sendPasswordResetEmail(user.email, user.name, token));
    await audit({ action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user._id, userId: user._id });
}
export async function resetPassword(token, newPassword) {
    // Atomic claim so a token can never be used twice, even concurrently.
    const record = await PasswordResetToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: 'PASSWORD_RESET', usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
    if (!record)
        throw new ValidationError('This reset link is invalid or has expired');
    const user = await User.findById(record.userId).select('+tokenVersion');
    if (!user || !user.isActive)
        throw new ValidationError('This reset link is invalid or has expired');
    user.passwordHash = await hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // revoke every existing session
    await user.save();
    await clearFailures(user.email); // the owner has proved control of the mailbox: lift any lock
    await audit({ action: 'PASSWORD_RESET', entity: 'User', entityId: user._id, userId: user._id });
    await disconnectUser(String(user._id)); // live sockets must not outlive the revoked sessions
}
export async function changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+passwordHash +tokenVersion');
    if (!user)
        throw new NotFoundError('User not found');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new UnauthorizedError('Current password is incorrect');
    }
    user.passwordHash = await hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    await audit({ action: 'PASSWORD_CHANGED', entity: 'User', entityId: user._id, userId: user._id });
    await disconnectUser(String(user._id)); // the client reconnects with its fresh token
    return issueSession(user); // fresh token so the current device stays signed in
}
/* ------------------------------------------------------------ email verification */
/** Creates a fresh verification token (replacing any old one) and emails the link in the background. */
async function issueEmailVerification(user) {
    await PasswordResetToken.deleteMany({ userId: user._id, purpose: 'EMAIL_VERIFY' });
    const { token, tokenHash } = generateOpaqueToken();
    await PasswordResetToken.create({ userId: user._id, tokenHash, purpose: 'EMAIL_VERIFY', expiresAt: new Date(Date.now() + VERIFY_TTL_MS) });
    runInBackground('verification email', () => sendEmailVerificationEmail(user.email, user.name, token));
}
export async function verifyEmail(token) {
    // Atomic single-use claim, like password reset.
    const record = await PasswordResetToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: 'EMAIL_VERIFY', usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
    if (!record)
        throw new ValidationError('This verification link is invalid or has expired');
    const user = await User.findByIdAndUpdate(record.userId, { $set: { isEmailVerified: true } }, { returnDocument: 'after' });
    if (!user)
        throw new ValidationError('This verification link is invalid or has expired');
    await audit({ action: 'EMAIL_VERIFIED', entity: 'User', entityId: user._id, userId: user._id });
    return user.toJSON();
}
export async function resendVerification(userId) {
    const user = await User.findById(userId);
    if (!user)
        throw new NotFoundError('User not found');
    if (user.isEmailVerified)
        return { alreadyVerified: true };
    await issueEmailVerification(user);
    return { alreadyVerified: false };
}
//# sourceMappingURL=auth.service.js.map