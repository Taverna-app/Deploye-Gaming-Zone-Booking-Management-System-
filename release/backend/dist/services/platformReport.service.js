import { DateTime } from 'luxon';
import { Booking, Business, Station } from '../models/index.js';
import { toCsv } from '../utils/csv.js';
import { EMPTY_SUMMARY, daySpan, enrichedFor, money, rate, resolveRange, summaryFields } from './report.service.js';
import { getSettings } from './superAdmin.service.js';
/**
 * The platform owner's report: every store side by side. It is built from the same pipeline stages as a store's own
 * report (`enrichedFor`, `summaryFields`), so a store's line here equals the total on that store's own report page.
 *
 * Stores can use different currencies and time zones, so:
 *  - money is never added across currencies: totals are given per currency, and a store's line is in its own currency
 *  - the range is in business days ("2026-03-01" is that store's own March 1st), exactly as in a store's report
 *  - the daily series carries counts for every store, and revenue for the stores in the primary currency (the one
 *    that earned the most), which the response names
 */
const yyyyMMdd = 'yyyy-MM-dd';
export async function getPlatformReport(q, now = new Date()) {
    const settings = await getSettings();
    const platformTz = settings?.defaultTimezone ?? 'Asia/Karachi';
    const { from, to, days } = resolveRange(q, platformTz, now);
    const prevTo = DateTime.fromFormat(from, yyyyMMdd).minus({ days: 1 });
    const prevFrom = prevTo.minus({ days: days.length - 1 });
    const businesses = await Business.find({}).select('name slug city status subscriptionStatus currency openingTime closingTime').lean();
    const match = { businessId: { $in: businesses.map((b) => b._id) } };
    const perStore = (start, end) => Booking.aggregate([...enrichedFor(match, start, end), { $group: { _id: '$businessId', ...summaryFields } }]);
    const [current, previous, stationCounts, customerCount] = await Promise.all([
        perStore(from, to),
        perStore(prevFrom.toFormat(yyyyMMdd), prevTo.toFormat(yyyyMMdd)),
        Station.aggregate([{ $match: { ...match, active: { $ne: false } } }, { $group: { _id: '$businessId', n: { $sum: 1 } } }]),
        Booking.aggregate([...enrichedFor(match, from, to), { $match: { counted: true } }, { $group: { _id: '$customerId' } }, { $count: 'n' }]),
    ]);
    const currentBy = new Map(current.map((r) => [String(r._id), r]));
    const previousBy = new Map(previous.map((r) => [String(r._id), r]));
    const stations = new Map(stationCounts.map((r) => [String(r._id), r.n]));
    const stores = businesses
        .map((b) => {
        const s = currentBy.get(String(b._id)) ?? EMPTY_SUMMARY;
        const p = previousBy.get(String(b._id)) ?? EMPTY_SUMMARY;
        const available = daySpan(b.openingTime, b.closingTime) * days.length * (stations.get(String(b._id)) ?? 0);
        return {
            storeId: String(b._id),
            name: b.name,
            slug: b.slug,
            city: b.city ?? '',
            status: b.status,
            subscriptionStatus: b.subscriptionStatus,
            currency: b.currency,
            stations: stations.get(String(b._id)) ?? 0,
            bookings: s.bookings,
            countedBookings: s.counted,
            completed: s.completed,
            cancelled: s.cancelled,
            noShow: s.noShow,
            revenue: money(s.revenue),
            bookedValue: money(s.bookedValue),
            outstanding: money(s.outstanding),
            hoursBooked: Math.round((s.minutes / 60) * 10) / 10,
            occupancyRate: rate(s.minutes, available),
            cancellationRate: rate(s.cancelled, s.bookings),
            noShowRate: rate(s.noShow, s.bookings - s.cancelled),
            previousRevenue: money(p.revenue),
            previousBookings: p.counted,
        };
    })
        .sort((a, b) => b.revenue - a.revenue || b.countedBookings - a.countedBookings || a.name.localeCompare(b.name));
    // Money per currency, never mixed.
    const byCurrency = new Map();
    for (const s of stores) {
        const c = byCurrency.get(s.currency) ?? { currency: s.currency, stores: 0, revenue: 0, bookedValue: 0, outstanding: 0, previousRevenue: 0 };
        c.stores += 1;
        c.revenue += s.revenue;
        c.bookedValue += s.bookedValue;
        c.outstanding += s.outstanding;
        c.previousRevenue += s.previousRevenue;
        byCurrency.set(s.currency, c);
    }
    const currencies = [...byCurrency.values()].map((c) => ({ ...c, revenue: money(c.revenue), bookedValue: money(c.bookedValue), outstanding: money(c.outstanding), previousRevenue: money(c.previousRevenue) })).sort((a, b) => b.revenue - a.revenue || a.currency.localeCompare(b.currency));
    const primaryCurrency = currencies[0]?.currency ?? null;
    const primaryIds = businesses.filter((b) => b.currency === primaryCurrency).map((b) => b._id);
    const dailyRows = await Booking.aggregate([
        ...enrichedFor(match, from, to),
        { $group: { _id: '$bookingDate', bookings: { $sum: { $cond: ['$counted', 1, 0] } }, revenue: { $sum: { $cond: [{ $in: ['$businessId', primaryIds] }, '$earned', 0] } } } },
    ]);
    const daily = new Map(dailyRows.map((r) => [r._id, r]));
    const sum = (pick) => stores.reduce((n, s) => n + pick(s), 0);
    const bookings = sum((s) => s.bookings);
    const cancelled = sum((s) => s.cancelled);
    const noShow = sum((s) => s.noShow);
    return {
        range: { from, to, days: days.length },
        previous: { from: prevFrom.toFormat(yyyyMMdd), to: prevTo.toFormat(yyyyMMdd), bookings: sum((s) => s.previousBookings) },
        primaryCurrency,
        currencies,
        summary: {
            stores: stores.length,
            storesWithBookings: stores.filter((s) => s.bookings > 0).length,
            bookings,
            countedBookings: sum((s) => s.countedBookings),
            completed: sum((s) => s.completed),
            cancelled,
            noShow,
            hoursBooked: Math.round(sum((s) => s.hoursBooked) * 10) / 10,
            cancellationRate: rate(cancelled, bookings),
            noShowRate: rate(noShow, bookings - cancelled),
            customers: customerCount[0]?.n ?? 0,
        },
        daily: days.map((date) => ({ date, bookings: daily.get(date)?.bookings ?? 0, revenue: money(daily.get(date)?.revenue ?? 0) })),
        stores,
    };
}
const COLUMNS = [
    { header: 'Store', value: (s) => s.name },
    { header: 'Slug', value: (s) => s.slug },
    { header: 'City', value: (s) => s.city },
    { header: 'Status', value: (s) => s.status },
    { header: 'Subscription', value: (s) => s.subscriptionStatus },
    { header: 'Currency', value: (s) => s.currency },
    { header: 'Stations', value: (s) => s.stations },
    { header: 'Bookings', value: (s) => s.bookings },
    { header: 'Counted bookings', value: (s) => s.countedBookings },
    { header: 'Completed', value: (s) => s.completed },
    { header: 'Cancelled', value: (s) => s.cancelled },
    { header: 'No-shows', value: (s) => s.noShow },
    { header: 'Hours booked', value: (s) => s.hoursBooked },
    { header: 'Occupancy', value: (s) => s.occupancyRate },
    { header: 'Revenue', value: (s) => s.revenue },
    { header: 'Booked value', value: (s) => s.bookedValue },
    { header: 'Outstanding', value: (s) => s.outstanding },
    { header: 'Previous period revenue', value: (s) => s.previousRevenue },
    { header: 'Previous period bookings', value: (s) => s.previousBookings },
];
/** One line per store. Store totals only: no customer names or contact details leave through this file. */
export async function exportPlatformReport(q) {
    const report = await getPlatformReport(q);
    return { csv: toCsv(report.stores, COLUMNS), filename: `platform-report-${report.range.from}_${report.range.to}.csv`, from: report.range.from, to: report.range.to, rows: report.stores.length };
}
//# sourceMappingURL=platformReport.service.js.map