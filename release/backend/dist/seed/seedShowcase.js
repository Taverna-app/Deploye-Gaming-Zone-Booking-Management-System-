/**
 * Loads the sales-demo stores (Arcadium, OG Gaming, Deadshot Esports Arena, O2 Esports, MAN CAVE):
 *   npm run seed:showcase              adds them to the database in MONGODB_URI (existing stores are skipped)
 *   npm run seed:showcase -- --reset   development only: wipes the database first
 *   npm run seed:showcase -- --replace  removes the five showcase stores (and an older generic-demo OG Gaming / Arcadium) with all
 *                                       their data, then loads them fresh; other stores and all customers stay
 *   npm run seed:showcase -- --receipts  after changing where files are stored: puts the sample receipt images back
 *   npm run seed:showcase -- --placeholder-prices   give stores without published rates labelled placeholder rates
 *                                                   instead of "price on request" (rehearsal only)
 * See showcaseData.ts for what is real and what is placeholder. Do not run it against a database that already holds the
 * older demo seed's stores of the same names.
 */
import { env, isProd } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { restoreShowcaseReceipts, runShowcaseSeed } from './showcaseData.js';
const DEV_PASSWORD = 'Zobix@Dev123';
async function main() {
    const reset = process.argv.includes('--reset');
    const password = process.env.SEED_PASSWORD ?? (isProd ? '' : DEV_PASSWORD);
    if (isProd && !process.env.ALLOW_PRODUCTION_SEED)
        throw new Error('Refusing to seed in production. Set ALLOW_PRODUCTION_SEED=1 and SEED_PASSWORD to override.');
    if (!password || (isProd && password === DEV_PASSWORD))
        throw new Error('SEED_PASSWORD must be set to a strong value in production.');
    if (reset && isProd)
        throw new Error('--reset is not allowed in production.');
    await connectDatabase();
    logger.info(`Loading the showcase stores into database "${env.MONGODB_DB}"${reset ? ' (reset)' : ''}`);
    const placeholderPrices = process.argv.includes('--placeholder-prices') || process.env.SHOWCASE_PLACEHOLDER_PRICES === '1';
    if (process.argv.includes('--receipts')) {
        logger.info('Sample receipts put back in file storage', await restoreShowcaseReceipts());
        await disconnectDatabase();
        return;
    }
    const replace = process.argv.includes('--replace');
    if (replace && isProd)
        throw new Error('--replace is not allowed in production.');
    const result = await runShowcaseSeed({ password, superAdminEmail: process.env.SEED_SUPERADMIN_EMAIL, reset, placeholderPrices, replace });
    logger.info('Showcase seed complete', { ...result });
    if (!isProd)
        logger.info(`Password for every seeded account: ${password}`);
    await disconnectDatabase();
}
main().catch(async (err) => {
    logger.error('Showcase seed failed', { error: err instanceof Error ? err.message : String(err) });
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
});
//# sourceMappingURL=seedShowcase.js.map