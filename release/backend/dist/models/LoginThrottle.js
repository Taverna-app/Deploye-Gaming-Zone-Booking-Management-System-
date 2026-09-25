import { Schema, model } from 'mongoose';
/**
 * Failed sign-in attempts per ACCOUNT (by email, whether or not such an account exists, so the answer never reveals
 * which emails are registered). The per-IP limiter stops one address hammering; this stops many addresses taking
 * turns on the same account.
 */
const loginThrottleSchema = new Schema({
    /** SHA-256 of the lower-cased email: the collection never holds addresses. */
    key: { type: String, required: true },
    failures: { type: Number, default: 0 },
    windowStartedAt: Date,
    lockedUntil: Date,
    /** TTL: the record disappears by itself once it can no longer matter. */
    expiresAt: { type: Date, required: true },
});
loginThrottleSchema.index({ key: 1 }, { unique: true });
loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LoginThrottle = model('LoginThrottle', loginThrottleSchema);
//# sourceMappingURL=LoginThrottle.js.map