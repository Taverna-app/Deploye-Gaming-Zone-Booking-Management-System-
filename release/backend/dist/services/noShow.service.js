import { Booking, BusinessSettings } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { settleNoShow } from './bookingOps.service.js';
const REASON = 'Customer did not arrive (marked automatically)';
const BATCH = 500;
/** Only bookings that started within this window are considered, so switching the setting on never sweeps up old history. */
const LOOKBACK_HOURS = 48;
/**
 * Marks bookings that nobody turned up for. For a store that set `noShowGraceMinutes` above 0, a PENDING or CONFIRMED
 * booking (never checked in) whose start time passed that many minutes ago becomes a NO_SHOW, exactly as if the desk
 * had pressed the button. Stores with the setting at 0 are never touched. Idempotent: each booking is claimed by a
 * status-guarded update, so overlapping runs cannot mark or announce one twice.
 */
export async function markAbsentBookings(now = new Date()) {
    const result = { checked: 0, marked: 0 };
    const oldest = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000);
    // Start from the stores that switched this on, so stores that did not can never crowd the batch.
    const stores = await BusinessSettings.find({ noShowGraceMinutes: { $gt: 0 } }).select('businessId noShowGraceMinutes').lean();
    for (const { businessId, noShowGraceMinutes: grace } of stores) {
        const candidates = await Booking.find({
            businessId,
            bookingStatus: { $in: ['PENDING', 'CONFIRMED'] },
            startDateTime: { $gte: oldest, $lte: new Date(now.getTime() - grace * 60_000) },
        })
            .sort({ startDateTime: 1 })
            .limit(BATCH)
            .select('bookingNumber businessId customerId')
            .lean();
        for (const booking of candidates) {
            result.checked++;
            try {
                if (await settleNoShow(booking, REASON, { automatic: true }))
                    result.marked++;
            }
            catch (err) {
                logger.error('Automatic no-show failed', { bookingNumber: booking.bookingNumber, error: err.message });
            }
        }
    }
    return result;
}
//# sourceMappingURL=noShow.service.js.map