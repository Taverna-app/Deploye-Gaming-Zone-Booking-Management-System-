import crypto from 'node:crypto';
import { Business, PasswordResetToken, User } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { generateOpaqueToken } from '../utils/token.js';
import { runInBackground } from '../utils/background.js';
import { PLATFORM_BRAND } from '../templates/emails/layout.js';
import { disconnectUser } from '../config/socket.js';
import { audit } from './audit.service.js';
import { sendStaffInvitationEmail } from './email.service.js';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FIELDS = 'name email phone role isActive lastLoginAt createdAt';
/**
 * A person on the team as the store admin sees it. `invited` = has never signed in, so their invitation is still
 * outstanding (or lapsed, in which case the admin can send it again).
 */
function toView(u) {
    return { ...u, invited: !u.lastLoginAt };
}
/** Store admins and desk staff of this store. Admins are listed for reference only; they are managed by the platform. */
export async function listTeam(businessId) {
    const people = await User.find({ businessIds: businessId, role: { $in: ['STORE_ADMIN', 'STAFF'] } })
        .select(FIELDS)
        .sort({ role: 1, name: 1 })
        .limit(200)
        .lean();
    return people.map(toView);
}
/** Loads a desk-staff member of THIS store. Anyone else (other stores, admins, customers) is "not found". */
async function findStaff(businessId, id) {
    const user = await User.findOne({ _id: id, businessIds: businessId, role: 'STAFF' });
    if (!user)
        throw new NotFoundError('Staff member not found');
    return user;
}
async function nameOf(userId) {
    return (await User.findById(userId).select('name').lean())?.name ?? 'The store team';
}
async function issueInvite(userId, invitee, businessId, inviterName) {
    // Only the newest link works.
    await PasswordResetToken.deleteMany({ userId, purpose: 'PASSWORD_RESET', usedAt: { $exists: false } });
    const { token, tokenHash } = generateOpaqueToken();
    await PasswordResetToken.create({ userId, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
    const business = await Business.findById(businessId).select('name branding logo').lean();
    runInBackground('staff invitation email', () => sendStaffInvitationEmail({
        to: invitee.email,
        inviteeName: invitee.name,
        storeName: business?.name ?? 'the store',
        inviterName,
        role: 'desk staff',
        token,
        brand: { name: business?.name ?? PLATFORM_BRAND.name, primaryColor: business?.branding?.primaryColor ?? PLATFORM_BRAND.primaryColor, logoUrl: business?.logo ?? undefined },
    }));
}
export async function inviteStaff(businessId, input, inviterId, req) {
    // An email that already has an account is never converted or reused: that could hand a customer's or another
    // store's account to this store without their say-so.
    if (await User.exists({ email: input.email }))
        throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    const user = await User.create({
        name: input.name,
        email: input.email,
        phone: input.phone,
        // Unguessable until the invitee sets their own through the emailed link.
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
        role: 'STAFF',
        businessIds: [businessId],
        isEmailVerified: true, // the invitation went to this address and only its owner can accept it
    });
    await issueInvite(user._id, input, businessId, await nameOf(inviterId));
    await audit({ action: 'STAFF_INVITED', entity: 'User', entityId: user._id, businessId, req, metadata: { email: input.email } });
    return toView(user.toJSON());
}
export async function resendInvite(businessId, id, inviterId, req) {
    const user = await findStaff(businessId, id);
    if (user.lastLoginAt)
        throw new ConflictError('This person has already joined', 'ALREADY_JOINED');
    if (!user.isActive)
        throw new ConflictError('Reactivate this person before inviting them again', 'INACTIVE');
    await issueInvite(user._id, user, businessId, await nameOf(inviterId));
    await audit({ action: 'STAFF_INVITE_RESENT', entity: 'User', entityId: user._id, businessId, req });
    return { sent: true };
}
export async function updateStaff(businessId, id, input, actorId, req) {
    const user = await findStaff(businessId, id);
    if (String(user._id) === actorId)
        throw new ValidationError('You cannot change your own account here');
    const changes = {};
    if (input.name !== undefined)
        changes.name = input.name;
    const unset = {};
    if (input.phone)
        changes.phone = input.phone;
    else if (input.phone === '')
        unset.phone = '';
    if (input.isActive !== undefined)
        changes.isActive = input.isActive;
    const deactivating = input.isActive === false && user.isActive;
    const update = { ...(Object.keys(changes).length && { $set: changes }), ...(Object.keys(unset).length && { $unset: unset }) };
    if (deactivating)
        update.$inc = { tokenVersion: 1 }; // every token they hold stops working now
    const fresh = await User.findByIdAndUpdate(user._id, update, { returnDocument: 'after', runValidators: true });
    if (deactivating) {
        await PasswordResetToken.deleteMany({ userId: user._id, usedAt: { $exists: false } }); // an open invitation dies too
        await disconnectUser(String(user._id));
    }
    await audit({
        action: deactivating ? 'STAFF_DEACTIVATED' : input.isActive === true && !user.isActive ? 'STAFF_REACTIVATED' : 'STAFF_UPDATED',
        entity: 'User',
        entityId: user._id,
        businessId,
        req,
        metadata: { fields: Object.keys(input) },
    });
    return toView(fresh.toJSON());
}
//# sourceMappingURL=staff.service.js.map