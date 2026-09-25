import { randomInt } from 'node:crypto';
import { User } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { clearFailures } from '../services/loginThrottle.service.js';
/**
 * The demo accounts share one well-known password, and they sit in a real database. After the demo is recorded or shown,
 * this gives all of them a new password and signs every session of theirs out. Only the demo accounts are touched: the
 * showcase stores' admins ("@showcase.test"), the demo customers ("@customer.demo"), the older generic demo's admins
 * ("@<store>.demo") and, when asked, the platform owner. Real customers and staff never match.
 */
export const DEMO_EMAIL = /(@showcase\.test|\.demo)$/i;
/** A strong password that is easy to read out and type: no look-alike characters. */
export function generatePassword() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (set) => set[randomInt(set.length)];
    const chars = [...Array.from({ length: 9 }, () => pick(letters)), ...Array.from({ length: 3 }, () => pick(digits))];
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return `${chars.join('')}-${pick(letters)}${pick(digits)}${pick(letters)}${pick(digits)}`;
}
export async function rotateDemoPasswords({ password, superAdminEmail, dryRun = false } = {}) {
    const chosen = password ?? generatePassword();
    const wanted = [{ email: DEMO_EMAIL }];
    if (superAdminEmail)
        wanted.push({ email: superAdminEmail.toLowerCase(), role: 'SUPER_ADMIN' });
    const accounts = await User.find({ $or: wanted }).select('email role').lean();
    if (!dryRun && accounts.length > 0) {
        const passwordHash = await hashPassword(chosen);
        // A new token version signs out every session and link the old password had.
        await User.updateMany({ _id: { $in: accounts.map((a) => a._id) } }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
        for (const a of accounts)
            await clearFailures(a.email).catch(() => undefined);
    }
    return { password: chosen, accounts: accounts.map((a) => ({ email: a.email, role: a.role })).sort((x, y) => x.email.localeCompare(y.email)), changed: !dryRun };
}
//# sourceMappingURL=rotateDemoPasswords.js.map