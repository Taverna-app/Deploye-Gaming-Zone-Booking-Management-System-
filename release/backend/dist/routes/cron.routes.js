import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { JOBS, runJob } from '../jobs/scheduler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { ok } from '../utils/response.js';
/**
 * Lets an external scheduler (Vercel Cron, GitHub Actions, uptime tools...) run the background jobs where no
 * long-lived process exists. Protected by a shared secret sent as `Authorization: Bearer <CRON_SECRET>`; without
 * CRON_SECRET configured the endpoint behaves as if it does not exist.
 */
export const cronRouter = Router();
const safeEqual = (a, b) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
};
const requireSecret = (req, _res, next) => {
    if (!env.CRON_SECRET)
        return next(new NotFoundError('Route not found'));
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer '))
        return next(new UnauthorizedError());
    if (!safeEqual(header.slice(7), env.CRON_SECRET))
        return next(new ForbiddenError('Invalid cron secret'));
    next();
};
const handler = asyncHandler(async (req, res) => {
    const name = req.params.job;
    if (!JOBS.some((j) => j.name === name))
        throw new NotFoundError(`Unknown job "${name}"`);
    const outcome = await runJob(name);
    ok(res, { job: name, ran: outcome !== null, result: outcome?.result ?? null }, outcome ? 'Job finished' : 'Job is already running');
});
// Vercel Cron issues GET; other schedulers typically POST.
cronRouter.get('/:job', requireSecret, handler);
cronRouter.post('/:job', requireSecret, handler);
//# sourceMappingURL=cron.routes.js.map