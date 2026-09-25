import { DateTime } from 'luxon';
/**
 * All wall-clock <-> instant conversion goes through here so the business timezone (never the server's
 * or browser's) decides what "8 PM" means. Instants are stored as UTC Dates.
 */
export function zonedToUtc(date, time, timezone) {
    const dt = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
    if (!dt.isValid)
        throw new Error(`Invalid date/time "${date} ${time}" in ${timezone}`);
    return dt.toUTC().toJSDate();
}
/** "YYYY-MM-DD" of an instant as seen in the given timezone. */
export const localDate = (instant, timezone) => DateTime.fromJSDate(instant, { zone: timezone }).toFormat('yyyy-MM-dd');
/** "HH:mm" of an instant as seen in the given timezone. */
export const localTime = (instant, timezone) => DateTime.fromJSDate(instant, { zone: timezone }).toFormat('HH:mm');
/** 0 = Sunday ... 6 = Saturday for a local calendar date. */
export function dayOfWeek(date, timezone) {
    const weekday = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: timezone }).weekday; // 1=Mon..7=Sun
    return weekday % 7;
}
export const addMinutes = (d, minutes) => new Date(d.getTime() + minutes * 60_000);
export const isValidTimezone = (tz) => DateTime.local().setZone(tz).isValid;
export const isValidLocalDate = (s) => DateTime.fromFormat(s, 'yyyy-MM-dd').isValid;
/** Compact "YYYYMMDD" used in booking numbers. */
export const compactDate = (date) => date.replaceAll('-', '');
//# sourceMappingURL=dateTime.js.map