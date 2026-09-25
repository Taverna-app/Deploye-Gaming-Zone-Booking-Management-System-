import { Booking, Payment, PromoCode } from '../models/index.js';
import { notifyBookingEvent } from '../helpers/notification.helper.js';
import { logger } from '../utils/logger.js';
import { runInTransaction } from '../utils/transaction.js';
import { audit } from './audit.service.js';
import { getEffectiveSettings } from './availability.service.js';
import { publishBooking } from './socket.service.js';
const EXPIRY_REASON = 'Payment was not received in time';
/** Never look at bookings younger than this, whatever a store configures. */
const MIN_AGE_MINUTES = 5;
const BATCH = 500;
/**
 * Releases slots held by bookings that were never paid. A PENDING booking paid by bank transfer or online is held for
 * the store's `paymentHoldMinutes` (default 2 hours, 0 = forever); after that it is cancelled so the slot can be
 * booked by someone else. A booking whose bank-transfer proof has been uploaded and is waiting for the store is never
 * expired: the delay is then the store's, not the customer's.
 */
export async function expireUnpaidBookings(now = new Date()) {
    const result = { checked: 0, expired: 0, awaitingReview: 0 };
    const youngest = new Date(now.getTime() - MIN_AGE_MINUTES * 60_000);
    const holds = new Map();
    const candidates = await Booking.find({
        bookingStatus: 'PENDING',
        paymentMethod: { $in: ['BANK_TRANSFER', 'ONLINE'] },
        paymentStatus: { $in: ['PENDING', 'REJECTED', 'FAILED'] },
        createdAt: { $lt: youngest },
        startDateTime: { $gt: new Date(0) },
    })
        .sort({ createdAt: 1 })
        .limit(BATCH)
        .select('bookingNumber businessId customerId bookingDate startTime endTime createdAt promoCode')
        .lean();
    for (const booking of candidates) {
        result.checked++;
        const businessId = String(booking.businessId);
        if (!holds.has(businessId))
            holds.set(businessId, (await getEffectiveSettings(businessId)).paymentHoldMinutes);
        const hold = holds.get(businessId);
        if (hold <= 0 || booking.createdAt.getTime() > now.getTime() - hold * 60_000)
            continue;
        const underReview = await Payment.exists({ bookingId: booking._id, status: 'PENDING', proofUploadedAt: { $exists: true } });
        if (underReview) {
            result.awaitingReview++;
            continue;
        }
        const done = await runInTransaction(async (session) => {
            const updated = await Booking.findOneAndUpdate({ _id: booking._id, bookingStatus: 'PENDING' }, { $set: { bookingStatus: 'CANCELLED', cancelledAt: now, cancellationReason: EXPIRY_REASON, paymentStatus: 'FAILED' } }, { session });
            if (!updated)
                return false; // paid / cancelled in the meantime
            await Payment.updateMany({ bookingId: booking._id, status: { $in: ['PENDING', 'REJECTED'] } }, { $set: { status: 'FAILED', rejectionReason: EXPIRY_REASON } }, { session });
            if (booking.promoCode) {
                await PromoCode.updateOne({ businessId: booking.businessId, code: booking.promoCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
            }
            return true;
        });
        if (!done)
            continue;
        result.expired++;
        await audit({ action: 'BOOKING_EXPIRED', entity: 'Booking', entityId: booking._id, businessId: booking.businessId, metadata: { bookingNumber: booking.bookingNumber, holdMinutes: hold } });
        publishBooking('booking:cancelled', booking._id);
        await notifyBookingEvent('BOOKING_CANCELLED', booking, { detail: `${EXPIRY_REASON}, so the slot was released.` }).catch((err) => logger.error('Expiry notice failed', { bookingNumber: booking.bookingNumber, error: err.message }));
    }
    return result;
}
//# sourceMappingURL=cleanup.service.js.map