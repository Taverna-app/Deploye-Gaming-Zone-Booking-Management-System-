import mongoose from 'mongoose';
import { Business } from '../models/Business.js';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
const TENANT_HEADER = 'x-business-id';
/**
 * Resolves `req.tenantId` for tenant-scoped routes. Controllers and services must scope every query
 * with this value - never with `req.body.businessId`.
 *
 * - STORE_ADMIN / STAFF: limited to their own `businessIds`. With several, the client picks one via
 *   the `X-Business-Id` header, and it is honoured only if it is in the user's authorized list.
 * - SUPER_ADMIN: may target any business via the header (store switcher). Without a header,
 *   `tenantId` stays undefined (platform-wide view); use `requireTenant` on routes that need one.
 * - CUSTOMER: has no tenant scope here.
 *
 * Non-super-admins are locked out of businesses that are not ACTIVE.
 */
export const tenantGuard = asyncHandler(async (req, _res, next) => {
    const user = req.user;
    if (!user)
        throw new UnauthorizedError();
    const requested = req.headers[TENANT_HEADER];
    const requestedId = Array.isArray(requested) ? requested[0] : requested;
    if (requestedId && !mongoose.isValidObjectId(requestedId))
        throw new ValidationError('Invalid business id');
    if (user.role === 'SUPER_ADMIN') {
        if (requestedId) {
            const exists = await Business.exists({ _id: requestedId });
            if (!exists)
                throw new ForbiddenError('Business not found');
            req.tenantId = requestedId;
        }
        return next();
    }
    if (user.role !== 'STORE_ADMIN' && user.role !== 'STAFF')
        return next();
    if (user.businessIds.length === 0)
        throw new ForbiddenError('No business is assigned to this account');
    let tenantId;
    if (requestedId) {
        if (!user.businessIds.includes(requestedId))
            throw new ForbiddenError('You do not have access to this business');
        tenantId = requestedId;
    }
    else if (user.businessIds.length === 1) {
        tenantId = user.businessIds[0];
    }
    else {
        throw new ValidationError('X-Business-Id header is required for accounts with multiple businesses');
    }
    const business = await Business.findById(tenantId).select('status').lean();
    if (!business || business.status !== 'ACTIVE') {
        throw new ForbiddenError('This business is not active');
    }
    req.tenantId = tenantId;
    next();
});
/** For routes that operate on exactly one tenant (a SUPER_ADMIN must have picked one). */
export const requireTenant = (req, _res, next) => {
    if (!req.tenantId)
        return next(new ValidationError('A business must be selected (X-Business-Id header)'));
    next();
};
/** Typed accessor for controllers/services. */
export function getTenantId(req) {
    if (!req.tenantId)
        throw new ValidationError('A business must be selected');
    return req.tenantId;
}
//# sourceMappingURL=tenant.middleware.js.map