import { Booking } from '../models/index.js';
import { notifyBookingEvent } from '../helpers/notification.helper.js';
import { logger } from '../utils/logger.js';
/** Reminder lead times, most distant first. */
export const REMINDER_LEADS = [
    { kind: '24H', minutes: 24 * 60, label: '24 hours' },
    { kind: '2H', minutes: 2 * 60, label: '2 hours' },
    { kind: '30M', minutes: 30, label: '30 minutes' },
];
/**
 * Which reminder (if any) should go out for this booking right now.
 *
 * A lead time is DUE when its moment (start - lead) has arrived AND the slot was already scheduled before that
 * moment - so a booking made three hours ahead never gets a "24 hours to go" reminder, and a booking moved to an
 * earlier time is judged against when it was moved. If several are due (e.g. after downtime) only the most
 * imminent is sent; earlier ones would just be stale. Nothing is sent twice.
 */
export function dueReminder(b, now) {
    const scheduled = (b.scheduledAt ?? b.createdAt).getTime();
    const start = b.startDateTime.getTime();
    if (start <= now.getTime())
        return null;
    const due = REMINDER_LEADS.filter((l) => start - l.minutes * 60_000 <= now.getTime() && scheduled <= start - l.minutes * 60_000);
    const chosen = due.at(-1); // list is ordered longest -> shortest lead, so the last due one is the most imminent
    if (!chosen)
        return null;
    if (b.remindersSent?.some((r) => r.kind === chosen.kind))
        return null;
    return chosen;
}
/**
 * Sends the reminders that are due. Safe to run any number of times, concurrently, on any number of servers: each
 * reminder is CLAIMED with an atomic update (a kind can only be pushed onto `remindersSent` once) before anything is
 * sent, so a second run - or a second instance - finds it already taken and does nothing.
 */
export async function runReminders(now = new Date()) {
    const horizon = new Date(now.getTime() + REMINDER_LEADS[0].minutes * 60_000);
    const result = { checked: 0, sent: 0, raced: 0 };
    const cursor = Booking.find({ bookingStatus: 'CONFIRMED', startDateTime: { $gt: now, $lte: horizon } })
        .select('bookingNumber businessId customerId bookingDate startTime endTime startDateTime scheduledAt createdAt remindersSent')
        .cursor();
    for await (const booking of cursor) {
        result.checked++;
        const lead = dueReminder(booking, now);
        if (!lead)
            continue;
        const claimed = await Booking.findOneAndUpdate({ _id: booking._id, bookingStatus: 'CONFIRMED', 'remindersSent.kind': { $ne: lead.kind } }, { $push: { remindersSent: { kind: lead.kind, sentAt: now, status: 'SENT' } } }, { returnDocument: 'after' });
        if (!claimed) {
            result.raced++;
            continue;
        }
        try {
            await notifyBookingEvent('BOOKING_REMINDER', claimed, { audience: 'customer', detail: `Starts in ${lead.label}.`, leadLabel: lead.label });
            result.sent++;
        }
        catch (err) {
            // The claim stands (no retry storm); the failure is recorded on the booking for support to see.
            await Booking.updateOne({ _id: booking._id, 'remindersSent.kind': lead.kind }, { $set: { 'remindersSent.$.status': 'FAILED' } });
            logger.error('Reminder failed', { bookingNumber: booking.bookingNumber, kind: lead.kind, error: err.message });
        }
    }
    return result;
}
//# sourceMappingURL=reminder.service.js.map