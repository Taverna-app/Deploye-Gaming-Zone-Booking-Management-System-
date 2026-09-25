import { DateTime } from 'luxon';
import { addMinutes, localTime, zonedToUtc } from '../utils/dateTime.js';
/**
 * Pure availability logic (no database access).
 *
 * A booking "date" is the BUSINESS DAY it belongs to. A store open 10:00-02:00 has a business day D that
 * runs from D 10:00 to (D+1) 02:00, so a 01:00 slot belongs to day D, not D+1.
 */
export const nextDate = (date) => DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: 'utc' }).plus({ days: 1 }).toFormat('yyyy-MM-dd');
export const daysBetween = (from, to) => Math.round(DateTime.fromFormat(to, 'yyyy-MM-dd', { zone: 'utc' }).diff(DateTime.fromFormat(from, 'yyyy-MM-dd', { zone: 'utc' }), 'days').days);
/** closing <= opening means the store closes after midnight (equal times = open 24h). */
export const isOvernight = (openingTime, closingTime) => closingTime <= openingTime;
export function businessDayWindow(date, openingTime, closingTime, timezone) {
    const open = zonedToUtc(date, openingTime, timezone);
    const close = zonedToUtc(isOvernight(openingTime, closingTime) ? nextDate(date) : date, closingTime, timezone);
    return { open, close };
}
/** Converts a local "HH:mm" on a business day into an instant, handling after-midnight times of overnight stores. */
export function startInstant(date, startTime, openingTime, closingTime, timezone) {
    const afterMidnight = isOvernight(openingTime, closingTime) && startTime < openingTime;
    return zonedToUtc(afterMidnight ? nextDate(date) : date, startTime, timezone);
}
/** Half-open interval overlap: [aStart, aEnd) and [bStart, bEnd). Touching ends do NOT overlap. */
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;
export function isOnSlotGrid(start, open, intervalMinutes) {
    const diff = (start.getTime() - open.getTime()) / 60_000;
    return Number.isInteger(diff) && diff >= 0 && diff % intervalMinutes === 0;
}
/** Every start time on the slot grid whose full duration fits inside opening hours, flagged free or not. */
export function buildSlots(opts) {
    const { open, close, intervalMinutes, durationMinutes, busy, earliestStart, timezone } = opts;
    const slots = [];
    for (let start = open; addMinutes(start, durationMinutes) <= close; start = addMinutes(start, intervalMinutes)) {
        const end = addMinutes(start, durationMinutes);
        let reason;
        if (start < earliestStart)
            reason = 'PAST';
        else if (busy.some((b) => overlaps(start, end, b.startDateTime, b.endDateTime)))
            reason = 'BOOKED';
        slots.push({
            startTime: localTime(start, timezone),
            endTime: localTime(end, timezone),
            startDateTime: start,
            endDateTime: end,
            available: !reason,
            ...(reason && { reason }),
        });
    }
    return slots;
}
//# sourceMappingURL=availability.helper.js.map