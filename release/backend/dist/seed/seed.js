import { env, isProd } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { runSeed } from './seedData.js';
// Development password used when SEED_PASSWORD is not set. Never allowed in production.
const DEV_PASSWORD = 'Zobix@Dev123';
async function main() {
    const reset = process.argv.includes('--reset');
    const password = process.env.SEED_PASSWORD ?? (isProd ? '' : DEV_PASSWORD);
    if (isProd && !process.env.ALLOW_PRODUCTION_SEED) {
        throw new Error('Refusing to seed in production. Set ALLOW_PRODUCTION_SEED=1 and SEED_PASSWORD to override.');
    }
    if (!password || (isProd && password === DEV_PASSWORD)) {
        throw new Error('SEED_PASSWORD must be set to a strong value in production.');
    }
    if (reset && isProd)
        throw new Error('--reset is not allowed in production.');
    await connectDatabase();
    logger.info(`Seeding database "${env.MONGODB_DB}"${reset ? ' (reset)' : ''}`);
    const result = await runSeed({ password, superAdminEmail: process.env.SEED_SUPERADMIN_EMAIL, reset });
    logger.info('Seed complete', { ...result });
    if (!isProd)
        logger.info(`Dev login password for all seeded accounts: ${password}`);
    await disconnectDatabase();
}
main().catch(async (err) => {
    logger.error('Seed failed', { error: err instanceof Error ? err.message : String(err) });
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map