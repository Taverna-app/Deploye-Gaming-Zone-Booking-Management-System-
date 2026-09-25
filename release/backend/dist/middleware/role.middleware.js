import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
/** Allow only the listed roles. Must run after `authenticate`. */
export const authorize = (...roles) => (req, _res, next) => {
    if (!req.user)
        return next(new UnauthorizedError());
    if (!roles.includes(req.user.role))
        return next(new ForbiddenError());
    next();
};
//# sourceMappingURL=role.middleware.js.map