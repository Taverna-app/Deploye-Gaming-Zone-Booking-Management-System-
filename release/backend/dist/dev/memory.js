/**
 * Local dev server on a throw-away in-memory MongoDB replica set, pre-seeded with the demo data.
 * Nothing touches Atlas, and email is disabled (SMTP credentials are blanked), so it is safe for
 * exploring the UI: `npm run dev:memory`. Data disappears when the process stops.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Zobix@Dev123';
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 90_000 }] });
// Set BEFORE the app modules load (dotenv never overrides variables that are already set).
process.env.NODE_ENV = 'development';
process.env.MONGODB_URI = replSet.getUri();
process.env.MONGODB_DB = 'gamingzone-dev';
process.env.JWT_SECRET = 'dev-memory-secret-dev-memory-secret-0123456789';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.MONGODB_DNS_SERVERS = '';
// A throw-away sandbox keeps its files on local disk, whatever backend/.env says (it must never write to real file storage).
process.env.STORAGE_DRIVER = 'local';
for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
    process.env[name] = '';
process.env.DISABLE_RATE_LIMIT ??= 'true'; // a local sandbox, and the end-to-end suites sign in a lot
const { connectDatabase } = await import('../config/database.js');
// `npm run dev:showcase` works in every shell; the environment variable is the same thing for those who prefer it.
const showcase = process.env.SEED_PROFILE === 'showcase' || process.argv.includes('--showcase');
const placeholderPrices = process.env.SHOWCASE_PLACEHOLDER_PRICES === '1' || process.argv.includes('--placeholder-prices');
const { runSeed } = await import('../seed/seedData.js');
const { runShowcaseSeed } = showcase ? await import('../seed/showcaseData.js') : { runShowcaseSeed: undefined };
await connectDatabase();
if (runShowcaseSeed)
    await runShowcaseSeed({ password: PASSWORD, placeholderPrices });
else
    await runSeed({ password: PASSWORD });
console.log('\n=== Zobix dev server (in-memory database, email disabled) ===');
console.log(`Password for every account: ${PASSWORD}`);
console.log('  Super admin : superadmin@zobixsolutions.com');
if (showcase) {
    console.log('  Store admins: arcadium@showcase.test | og-gaming@showcase.test | deadshot@showcase.test | o2-esports@showcase.test | man-cave@showcase.test');
}
else {
    console.log('  Store admins: admin@zobix-arena.demo | admin@og-gaming.demo | admin@arcadium.demo');
}
console.log('  Customers   : ali.raza@customer.demo | sara.ahmed@customer.demo | ...\n');
await import('../server.js');
const stop = async () => {
    await replSet.stop();
    process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
//# sourceMappingURL=memory.js.map