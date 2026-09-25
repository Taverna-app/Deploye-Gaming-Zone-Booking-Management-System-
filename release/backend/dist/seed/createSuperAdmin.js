/**
 * Creates the first super admin on a production database:
 *   SUPERADMIN_EMAIL=you@example.com SUPERADMIN_NAME="Your Name" SUPERADMIN_PASSWORD='...' npm run create-superadmin
 * The password is read from the environment (never from a command-line argument, which other users of a machine can see).
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { createSuperAdmin } from './superAdmin.js';
async function main() {
    const { SUPERADMIN_EMAIL: email, SUPERADMIN_NAME: name, SUPERADMIN_PASSWORD: password } = process.env;
    if (!email || !name || !password)
        throw new Error('Set SUPERADMIN_EMAIL, SUPERADMIN_NAME and SUPERADMIN_PASSWORD in the environment.');
    await connectDatabase();
    const admin = await createSuperAdmin({ email, name, password });
    logger.info('Super admin created', { email: admin.email });
    await disconnectDatabase();
}
main().catch(async (err) => {
    const detail = err.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
    logger.error(`Could not create the super admin: ${err instanceof Error ? err.message : String(err)}${detail ? ` (${detail})` : ''}`);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
});
//# sourceMappingURL=createSuperAdmin.js.map