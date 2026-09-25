import { hashToken } from '../utils/token.js';
import { LoginThrottle } from '../models/index.js';
import { TooManyRequestsError } from '../utils/errors.js';
/** Eight wrong passwords within 15 minutes lock the account for 15 minutes. */
export const MAX_FAILURES = 8;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
const keyOf = (email) => hashToken(email.trim().toLowerCase());
/** Throws (429) while the account is locked. Called BEFORE the password is checked, so a locked account costs nothing to refuse. */
export async function assertNotLocked(email, now = new Date()) {
    const record = await LoginThrottle.findOne({ key: keyOf(email) }).select('lockedUntil').lean();
    if (record?.lockedUntil && record.lockedUntil > now) {
        throw new TooManyRequestsError('Too many failed sign-in attempts. Try again later, or reset your password.', Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000));
    }
}
/** Counts one failed attempt, atomically, and starts the lock when the limit is reached. */
export async function recordFailure(email, now = new Date()) {
    const cutoff = new Date(now.getTime() - WINDOW_MS);
    const inWindow = { $gt: ['$windowStartedAt', cutoff] };
    await LoginThrottle.findOneAndUpdate({ key: keyOf(email) }, [
        { $set: { failures: { $cond: [inWindow, { $add: [{ $ifNull: ['$failures', 0] }, 1] }, 1] }, windowStartedAt: { $cond: [inWindow, '$windowStartedAt', now] } } },
        {
            $set: {
                lockedUntil: { $cond: [{ $gte: ['$failures', MAX_FAILURES] }, new Date(now.getTime() + LOCK_MS), '$$REMOVE'] },
                expiresAt: new Date(now.getTime() + WINDOW_MS + LOCK_MS + 60_000),
            },
        },
    ], { upsert: true, updatePipeline: true });
}
/** A successful sign-in, or a completed password reset, wipes the slate. */
export async function clearFailures(email) {
    await LoginThrottle.deleteOne({ key: keyOf(email) });
}
//# sourceMappingURL=loginThrottle.service.js.map