import { User } from '../models/User.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
function extractToken(header) {
    if (!header?.startsWith('Bearer '))
        return null;
    return header.slice(7).trim() || null;
}
/**
 * Verifies a JWT, then reloads the user so role, tenants, active flag and revocation are always current.
 * Nothing about identity or tenant access is trusted from the token beyond `sub`. Shared by the REST middleware
 * and the Socket.IO handshake so both enforce exactly the same rules.
 */
export async function resolveAuthUser(token) {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('+tokenVersion role businessIds isActive').lean();
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
        throw new UnauthorizedError('Session is no longer valid');
    }
    if (payload.imp) {
        // Impersonation stays valid only while the originating super admin is still an active super admin.
        const admin = await User.findById(payload.imp).select('role isActive').lean();
        if (!admin || !admin.isActive || admin.role !== 'SUPER_ADMIN') {
            throw new UnauthorizedError('Impersonation session is no longer valid');
        }
    }
    return {
        id: String(user._id),
        role: user.role,
        businessIds: user.businessIds.map(String),
        impersonatedBy: payload.imp,
    };
}
export const authenticate = asyncHandler(async (req, _res, next) => {
    const token = extractToken(req.headers.authorization);
    if (!token)
        throw new UnauthorizedError();
    req.user = await resolveAuthUser(token);
    next();
});
/** Attaches req.user when a valid token is present but never rejects (public endpoints). */
export const optionalAuth = (req, res, next) => {
    if (!extractToken(req.headers.authorization))
        return next();
    return authenticate(req, res, next);
};
//# sourceMappingURL=auth.middleware.js.map