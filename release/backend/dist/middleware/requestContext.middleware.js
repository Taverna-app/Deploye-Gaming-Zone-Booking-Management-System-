import { randomUUID } from 'node:crypto';
import { isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';
/**
 * Gives every request an id (returned as X-Request-Id and included in error bodies, so a user's report can be matched
 * to a log line), keeps API responses out of shared caches, and writes one access-log line per request in production.
 * The log holds the method, the path WITHOUT its query string (which can carry search terms and tokens), the status
 * and the time taken. Never headers or bodies.
 */
export const requestContext = (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    // Only a well-formed inbound id is trusted (it ends up in logs), otherwise a fresh one is made.
    const id = typeof incoming === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    res.setHeader('Cache-Control', 'no-store');
    if (isProd) {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            logger.info('request', {
                requestId: id,
                method: req.method,
                path: req.originalUrl.split('?')[0],
                status: res.statusCode,
                ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
                ...(req.user && { userId: req.user.id }),
            });
        });
    }
    next();
};
//# sourceMappingURL=requestContext.middleware.js.map