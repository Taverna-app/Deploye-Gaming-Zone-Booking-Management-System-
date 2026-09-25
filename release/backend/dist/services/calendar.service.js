import { DateTime } from 'luxon';
import { Booking, Business, Station } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
/** A month of a busy store can have thousands of bookings; the grid is capped and says so. */
const MAX_BOOKINGS = 3000;
/** Business-day range shown for a view: a day, the Monday-Sunday week containing the date, or the calendar month. */
export function calendarRange(view, date) {
    const d = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: 'utc' });
    const [from, to] = view === 'day' ? [d, d] : view === 'week' ? [d.startOf('week'), d.endOf('week')] : [d.startOf('month'), d.endOf('month')];
    const days = [];
    for (let cur = from.startOf('day'); cur <= to; cur = cur.plus({ days: 1 }))
        days.push(cur.toFormat('yyyy-MM-dd'));
    return { from: days[0], to: days[days.length - 1], days };
}
/**
 * Data for the admin calendar: station rows and the bookings on them for the chosen day / week / month. The client
 * draws the grid; changing a booking from the calendar goes through the normal reschedule endpoint, so every move
 * is re-validated by the availability engine.
 */
export async function getCalendar(businessId, q) {
    const business = await Business.findById(businessId).select('timezone openingTime closingTime currency').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const range = calendarRange(q.view, q.date);
    const stations = await Station.find({ businessId, ...(q.categoryId && { categoryId: q.categoryId }) })
        .sort({ code: 1 })
        .select('code name categoryId status active capacity')
        .lean();
    const filter = {
        businessId,
        stationId: { $in: stations.map((s) => s._id) },
        bookingDate: { $gte: range.from, $lte: range.to },
        ...(q.includeCancelled === 'true' ? {} : { bookingStatus: { $ne: 'CANCELLED' } }),
    };
    const bookings = await Booking.find(filter)
        .sort({ startDateTime: 1 })
        .limit(MAX_BOOKINGS + 1)
        .select('bookingNumber stationId categoryId customerId bookingDate startTime endTime startDateTime endDateTime durationMinutes numberOfPlayers bookingStatus paymentStatus paymentMethod totalAmount source')
        .populate('customerId', 'name phone')
        .lean();
    return {
        view: q.view,
        date: q.date,
        range: { from: range.from, to: range.to },
        days: range.days,
        timezone: business.timezone,
        openingTime: business.openingTime,
        closingTime: business.closingTime,
        currency: business.currency,
        stations,
        bookings: bookings.slice(0, MAX_BOOKINGS),
        truncated: bookings.length > MAX_BOOKINGS,
    };
}
//# sourceMappingURL=calendar.service.js.map