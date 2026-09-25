import { Booking, MigrationRecord, Payment } from '../models/index.js';
import { logger } from './logger.js';
/**
 * Bookings now carry `amountPaid` (kept by the payment code). Databases that already had bookings need it filled in
 * once, or their reports and customer totals would show 0 received. Only bookings that have a PAID payment need a
 * value (a missing field is read as 0), and a booking that is already right is left alone, so this is safe to repeat.
 */
async function backfillAmountPaid() {
    const totals = Payment.aggregate([{ $match: { status: 'PAID' } }, { $group: { _id: '$bookingId', total: { $sum: '$amount' } } }]).cursor();
    let updated = 0;
    let batch = [];
    const flush = async () => {
        if (!batch.length)
            return;
        const res = await Booking.bulkWrite(batch, { ordered: false });
        updated += res.modifiedCount;
        batch = [];
    };
    for await (const row of totals) {
        batch.push({ updateOne: { filter: { _id: row._id, amountPaid: { $ne: row.total } }, update: { $set: { amountPaid: row.total } } } });
        if (batch.length >= 1000)
            await flush();
    }
    await flush();
    return { updated };
}
const MIGRATIONS = [{ name: '2026-09-amount-paid-on-bookings', run: backfillAmountPaid }];
/** Runs every migration that has not run on this database yet. Called when the server starts. */
export async function runMigrations() {
    const done = new Set((await MigrationRecord.find().select('name').lean()).map((m) => m.name));
    const ran = [];
    for (const m of MIGRATIONS.filter((x) => !done.has(x.name))) {
        const started = Date.now();
        const details = await m.run();
        await MigrationRecord.updateOne({ name: m.name }, { $setOnInsert: { name: m.name, ranAt: new Date(), details } }, { upsert: true });
        logger.info(`Migration ${m.name} done`, { ...details, ms: Date.now() - started });
        ran.push(m.name);
    }
    return ran;
}
//# sourceMappingURL=migrations.js.map