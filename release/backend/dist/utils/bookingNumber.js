import { nextSequence } from '../models/Counter.js';
import { compactDate } from './dateTime.js';
/**
 * "ZGA-20260920-0001": business prefix, local booking-creation date, per-business daily sequence.
 * The counter is atomic, so concurrent bookings never receive the same number.
 */
export async function generateBookingNumber(business, localDate, session) {
    const day = compactDate(localDate);
    const seq = await nextSequence(`booking:${String(business._id)}:${day}`, session);
    return `${business.bookingPrefix}-${day}-${String(seq).padStart(4, '0')}`;
}
//# sourceMappingURL=bookingNumber.js.map