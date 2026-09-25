import { z } from 'zod';
import { SystemSetting, User } from '../models/index.js';
import { ConflictError, ValidationError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
const inputSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(2).max(120),
    // Stricter than a customer's: this account can see every store.
    password: z
        .string()
        .min(12, 'Use at least 12 characters')
        .max(128)
        .regex(/[A-Za-z]/, 'Include a letter')
        .regex(/\d/, 'Include a number'),
});
/**
 * Creates the platform owner's account on a fresh (production) database, without any of the demo stores that
 * `npm run seed` adds. It never overwrites or resets an existing account: use "forgot password" for that.
 */
export async function createSuperAdmin(input) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
        throw new ValidationError('Invalid super admin details', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    const { email, name, password } = parsed.data;
    if (await User.exists({ email }))
        throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    await SystemSetting.updateOne({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true });
    const user = await User.create({ name, email, passwordHash: await hashPassword(password), role: 'SUPER_ADMIN', isEmailVerified: true });
    return { id: String(user._id), email: user.email };
}
//# sourceMappingURL=superAdmin.js.map