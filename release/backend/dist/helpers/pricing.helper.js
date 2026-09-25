import { DateTime } from 'luxon';
import { PricingError } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
const STEP_MINUTES = 5;
const TYPE_RANK = { SPECIAL_DATE: 3, PEAK: 2, WEEKEND: 1, NORMAL: 0 };
const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};
/** Does `minutes` fall in [start, end)? Handles overnight windows (22:00-02:00). "23:59" means end of day. */
export function inTimeWindow(minutes, start, end) {
    if (!start && !end)
        return true;
    const s = start ? toMinutes(start) : 0;
    const e = end ? (end === '23:59' ? 1440 : toMinutes(end)) : 1440;
    if (s === e)
        return true;
    return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}
export function ruleMatches(rule, at) {
    if (!inTimeWindow(at.minutes, rule.startTime, rule.endTime))
        return false;
    if (rule.daysOfWeek?.length && !rule.daysOfWeek.includes(at.dow))
        return false;
    if (rule.ruleType === 'SPECIAL_DATE') {
        if (rule.startDate && at.date < rule.startDate)
            return false;
        if (rule.endDate && at.date > rule.endDate)
            return false;
    }
    return true;
}
export function sortRules(rules) {
    return [...rules].sort((a, b) => Number(Boolean(b.stationId)) - Number(Boolean(a.stationId)) ||
        (b.priority ?? 0) - (a.priority ?? 0) ||
        TYPE_RANK[b.ruleType] - TYPE_RANK[a.ruleType] ||
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
}
/** `sorted` must already be ordered by `sortRules`. */
export function resolveAt(sorted, at, allowFixed) {
    const matching = sorted.filter((r) => ruleMatches(r, at) && (allowFixed || r.fixedPrice == null));
    const winner = matching[0];
    if (!winner)
        return null;
    if (winner.pricePerHour != null)
        return { rule: winner, ratePerHour: winner.pricePerHour, fixedPrice: null };
    if (winner.fixedPrice != null)
        return { rule: winner, ratePerHour: null, fixedPrice: winner.fixedPrice };
    if (winner.multiplier != null) {
        const base = matching.find((r) => r.pricePerHour != null);
        if (!base)
            return null;
        return { rule: winner, ratePerHour: base.pricePerHour * winner.multiplier, fixedPrice: null };
    }
    return null;
}
export function localMoment(instant, timezone) {
    const dt = DateTime.fromJSDate(instant, { zone: timezone });
    return { date: dt.toFormat('yyyy-MM-dd'), minutes: dt.hour * 60 + dt.minute, dow: dt.weekday % 7 };
}
export function priceBooking(rules, opts) {
    const { start, durationMinutes, timezone } = opts;
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0)
        throw new PricingError('Invalid booking duration');
    const sorted = sortRules(rules);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const first = resolveAt(sorted, localMoment(start, timezone), true);
    if (!first)
        throw new PricingError('Pricing is not configured for this station');
    if (first.fixedPrice != null) {
        const amount = roundMoney(first.fixedPrice);
        return {
            mode: 'FIXED',
            baseAmount: amount,
            segments: [{ from: start, to: end, minutes: durationMinutes, ratePerHour: null, ruleId: String(first.rule._id), ruleName: first.rule.name, amount }],
        };
    }
    const segments = [];
    for (let offset = 0; offset < durationMinutes; offset += STEP_MINUTES) {
        const minutes = Math.min(STEP_MINUTES, durationMinutes - offset);
        const from = new Date(start.getTime() + offset * 60_000);
        const resolved = resolveAt(sorted, localMoment(from, timezone), false);
        if (!resolved || resolved.ratePerHour == null)
            throw new PricingError('Pricing is not configured for the selected time');
        const ruleId = String(resolved.rule._id);
        const last = segments[segments.length - 1];
        if (last && last.ruleId === ruleId && last.ratePerHour === resolved.ratePerHour) {
            last.minutes += minutes;
            last.to = new Date(from.getTime() + minutes * 60_000);
        }
        else {
            segments.push({
                from,
                to: new Date(from.getTime() + minutes * 60_000),
                minutes,
                ratePerHour: resolved.ratePerHour,
                ruleId,
                ruleName: resolved.rule.name,
                amount: 0,
            });
        }
    }
    for (const s of segments)
        s.amount = roundMoney((s.ratePerHour * s.minutes) / 60);
    return { mode: 'HOURLY', baseAmount: roundMoney(segments.reduce((sum, s) => sum + s.amount, 0)), segments };
}
//# sourceMappingURL=pricing.helper.js.map