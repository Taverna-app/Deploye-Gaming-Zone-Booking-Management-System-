import { logger } from './logger.js';
const inFlight = new Set();
/**
 * Runs slow side effects (SMTP, webhooks) without holding up the HTTP response. Failures are logged, never thrown.
 * The work is tracked so shutdown (and tests) can wait for it with `flushBackground()`.
 */
export function runInBackground(label, job) {
    const p = job()
        .catch((err) => logger.error(`Background job failed: ${label}`, { error: err instanceof Error ? err.message : String(err) }))
        .finally(() => inFlight.delete(p));
    inFlight.add(p);
}
/** Resolves once everything started with `runInBackground` has finished (including work those jobs start). */
export async function flushBackground() {
    while (inFlight.size > 0)
        await Promise.allSettled([...inFlight]);
}
//# sourceMappingURL=background.js.map