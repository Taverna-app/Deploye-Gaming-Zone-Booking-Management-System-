import rateLimit from 'express-rate-limit';
const options = (message) => ({
    // Integration suites fire hundreds of requests a minute from one address; limits are for real traffic. The throw-away
    // in-memory dev server (`npm run dev:memory`) also switches them off so the end-to-end suites can sign in as many times as they need.
    // Never in production: DISABLE_RATE_LIMIT is ignored there, so a stray variable cannot switch the protection off.
    skip: () => process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && process.env.DISABLE_RATE_LIMIT === 'true'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED', errors: [] },
});
export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, ...options('Too many requests, slow down') });
/** Stricter limiter for login/register/forgot-password. */
export const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    ...options('Too many authentication attempts, try again later'),
});
/** Price quotes can probe promo codes, so they get their own tighter limit. */
export const quoteLimiter = rateLimit({ windowMs: 60_000, limit: 60, ...options('Too many price checks, slow down') });
/** Reports and CSV exports run heavy aggregations and hand out customer data, so they get a tight limit of their own. */
export const reportLimiter = rateLimit({ windowMs: 60_000, limit: 30, ...options('Too many report requests, slow down') });
export const exportLimiter = rateLimit({ windowMs: 60_000, limit: 10, ...options('Too many downloads, try again in a minute') });
/** Anything that sends an email to a third party (staff invitations) or stores an upload. */
export const inviteLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, ...options('Too many invitations, try again later') });
export const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 10, ...options('Too many uploads, try again in a minute') });
//# sourceMappingURL=rateLimit.middleware.js.map