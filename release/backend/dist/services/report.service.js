import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import { Booking, Business, GamingCategory, Payment, Station, User } from '../models/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
import { localDate } from '../utils/dateTime.js';
import { toCsv } from '../utils/csv.js';
/**
 * Store reports, all computed from the database with aggregation pipelines.
 *
 * Bases used everywhere (so the numbers agree with each other):
 *  - a booking belongs to the range by its BUSINESS DAY (`bookingDate`), not by when it was made or paid
 *  - "counted" bookings hold or used a slot: PENDING, CONFIRMED, CHECKED_IN, COMPLETED (cancelled and no-show do not)
 *  - revenue = money actually received (payments in status PAID, so refunds are already out) for bookings that are
 *    not cancelled. It is counted on the day of the booking.
 */
const COUNTED = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
const MAX_EXPORT_ROWS = 50_000;
export const money = roundMoney;
export const rate = (n, d) => (d > 0 ? Math.round((n / d) * 10_000) / 10_000 : 0);
async function loadScope(businessId) {
    const business = await Business.findById(businessId).select('timezone openingTime closingTime currency').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    return { businessId, timezone: business.timezone, openingTime: business.openingTime, closingTime: business.closingTime, currency: business.currency };
}
/** Resolves the requested range (default: the last 30 business days up to today in the store's timezone). */
export function resolveRange(q, timezone, now = new Date()) {
    const to = q.to ?? localDate(now, timezone);
    const from = q.from ?? DateTime.fromFormat(to, 'yyyy-MM-dd').minus({ days: 29 }).toFormat('yyyy-MM-dd');
    const days = [];
    for (let d = DateTime.fromFormat(from, 'yyyy-MM-dd'); d <= DateTime.fromFormat(to, 'yyyy-MM-dd'); d = d.plus({ days: 1 }))
        days.push(d.toFormat('yyyy-MM-dd'));
    return { from, to, days };
}
const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};
/** Minutes in one business day. Closing at or before opening runs past midnight; equal means a full day. */
export const daySpan = (opening, closing) => {
    const span = (((toMinutes(closing) - toMinutes(opening)) % 1440) + 1440) % 1440;
    return span === 0 ? 1440 : span;
};
/** Every booking of the range with what was actually paid for it attached. */
function enrichedBookings(businessId, from, to) {
    return enrichedFor({ businessId: new Types.ObjectId(businessId) }, from, to);
}
/** The same, for any set of stores (`match` names them). Shared with the platform-wide report so both add up alike. */
export function enrichedFor(match, from, to) {
    return [
        { $match: { ...match, bookingDate: { $gte: from, $lte: to } } },
        {
            $addFields: {
                counted: { $in: ['$bookingStatus', COUNTED] },
                paid: { $ifNull: ['$amountPaid', 0] },
            },
        },
        {
            $addFields: {
                // A cancelled booking's payment is money to give back, not revenue.
                earned: { $cond: [{ $eq: ['$bookingStatus', 'CANCELLED'] }, 0, '$paid'] },
                // Still to be collected. A refunded booking was paid and given back: nothing is owed on it.
                unpaid: { $cond: [{ $and: ['$counted', { $ne: ['$paymentStatus', 'REFUNDED'] }] }, { $max: [0, { $subtract: ['$totalAmount', '$paid'] }] }, 0] },
            },
        },
    ];
}
export const sumIf = (cond, value = 1) => ({ $sum: { $cond: [cond, value, 0] } });
export const isStatus = (s) => ({ $eq: ['$bookingStatus', s] });
export const summaryFields = {
    bookings: { $sum: 1 },
    counted: sumIf('$counted'),
    completed: sumIf(isStatus('COMPLETED')),
    cancelled: sumIf(isStatus('CANCELLED')),
    noShow: sumIf(isStatus('NO_SHOW')),
    revenue: { $sum: '$earned' },
    bookedValue: sumIf('$counted', '$totalAmount'),
    outstanding: { $sum: '$unpaid' },
    minutes: sumIf('$counted', '$durationMinutes'),
    discount: sumIf('$counted', '$discountAmount'),
};
const summaryGroup = { $group: { _id: null, ...summaryFields } };
export const EMPTY_SUMMARY = { bookings: 0, counted: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0, bookedValue: 0, outstanding: 0, minutes: 0, discount: 0 };
const byField = (field) => [
    { $group: { _id: field, bookings: sumIf('$counted'), minutes: sumIf('$counted', '$durationMinutes'), revenue: { $sum: '$earned' } } },
];
export async function getReport(businessId, q) {
    const scope = await loadScope(businessId);
    const { from, to, days } = resolveRange(q, scope.timezone);
    // The equal-length period just before, for "up / down" comparisons.
    const prevTo = DateTime.fromFormat(from, 'yyyy-MM-dd').minus({ days: 1 });
    const prevFrom = prevTo.minus({ days: days.length - 1 });
    const previousRows = await Booking.aggregate([...enrichedBookings(businessId, prevFrom.toFormat('yyyy-MM-dd'), prevTo.toFormat('yyyy-MM-dd')), summaryGroup]);
    const previous = previousRows[0] ?? EMPTY_SUMMARY;
    const [facets] = await Booking.aggregate([
        ...enrichedBookings(businessId, from, to),
        {
            $facet: {
                summary: [summaryGroup],
                daily: [{ $group: { _id: '$bookingDate', bookings: sumIf('$counted'), cancelled: sumIf(isStatus('CANCELLED')), revenue: { $sum: '$earned' } } }],
                stations: byField('$stationId'),
                categories: byField('$categoryId'),
                methods: [{ $group: { _id: '$paymentMethod', bookings: sumIf('$counted'), revenue: { $sum: '$earned' } } }],
                sources: [{ $group: { _id: '$source', bookings: sumIf('$counted'), revenue: { $sum: '$earned' } } }],
                hours: [{ $match: { counted: true } }, { $group: { _id: { $substrCP: ['$startTime', 0, 2] }, bookings: { $sum: 1 } } }],
                weekdays: [
                    { $match: { counted: true } },
                    { $group: { _id: { $dayOfWeek: { $dateFromString: { dateString: '$bookingDate' } } }, bookings: { $sum: 1 } } },
                ],
                promos: [
                    { $match: { counted: true, promoCode: { $nin: [null, ''] } } },
                    { $group: { _id: '$promoCode', uses: { $sum: 1 }, discount: { $sum: '$discountAmount' }, revenue: { $sum: '$earned' } } },
                    { $sort: { uses: -1 } },
                    { $limit: 20 },
                ],
                customerTotals: [
                    { $match: { counted: true } },
                    { $group: { _id: '$customerId', bookings: { $sum: 1 } } },
                    { $group: { _id: null, customers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ['$bookings', 2] }, 1, 0] } } } },
                ],
                topCustomers: [
                    { $match: { counted: true } },
                    { $group: { _id: '$customerId', bookings: { $sum: 1 }, spent: { $sum: '$earned' } } },
                    { $sort: { spent: -1, bookings: -1 } },
                    { $limit: 10 },
                ],
            },
        },
    ]);
    const s = facets.summary[0] ?? EMPTY_SUMMARY;
    const span = daySpan(scope.openingTime, scope.closingTime);
    const [stationDocs, categoryDocs, customerDocs] = await Promise.all([
        Station.find({ businessId }).select('code name categoryId active').sort({ code: 1 }).lean(),
        GamingCategory.find({ businessId }).select('name').lean(),
        User.find({ _id: { $in: facets.topCustomers.map((c) => c._id) } }).select('name phone isWalkIn').lean(),
    ]);
    const categoryName = new Map(categoryDocs.map((c) => [String(c._id), c.name]));
    const stationStats = new Map(facets.stations.map((r) => [String(r._id), r]));
    const categoryStats = new Map(facets.categories.map((r) => [String(r._id), r]));
    // Stations that are switched on, plus any that had bookings in the period.
    const shownStations = stationDocs.filter((st) => st.active !== false || (stationStats.get(String(st._id))?.bookings ?? 0) > 0);
    const availableMinutesPerStation = span * days.length;
    const totalAvailable = availableMinutesPerStation * Math.max(shownStations.length, 1);
    const daily = new Map(facets.daily.map((r) => [r._id, r]));
    const hourStats = new Map(facets.hours.map((r) => [Number(r._id), r.bookings]));
    const openHour = Math.floor(toMinutes(scope.openingTime) / 60);
    const hourCount = Math.min(24, Math.ceil((toMinutes(scope.openingTime) % 60 + span) / 60));
    const weekdayStats = new Map(facets.weekdays.map((r) => [r._id - 1, r.bookings])); // Mongo: 1 = Sunday
    const totals = facets.customerTotals[0] ?? { customers: 0, repeat: 0 };
    const nonCancelled = s.bookings - s.cancelled;
    const customerName = new Map(customerDocs.map((u) => [String(u._id), u]));
    return {
        range: { from, to, days: days.length },
        previous: { from: prevFrom.toFormat('yyyy-MM-dd'), to: prevTo.toFormat('yyyy-MM-dd'), revenue: money(previous.revenue), bookings: previous.counted },
        currency: scope.currency,
        timezone: scope.timezone,
        summary: {
            bookings: s.bookings,
            countedBookings: s.counted,
            completed: s.completed,
            cancelled: s.cancelled,
            noShow: s.noShow,
            revenue: money(s.revenue),
            bookedValue: money(s.bookedValue),
            outstanding: money(s.outstanding),
            discountTotal: money(s.discount),
            avgBookingValue: s.counted ? money(s.bookedValue / s.counted) : 0,
            avgDurationMinutes: s.counted ? Math.round(s.minutes / s.counted) : 0,
            hoursBooked: Math.round((s.minutes / 60) * 10) / 10,
            occupancyRate: rate(s.minutes, totalAvailable),
            cancellationRate: rate(s.cancelled, s.bookings),
            noShowRate: rate(s.noShow, nonCancelled),
            customers: totals.customers,
            repeatCustomers: totals.repeat,
        },
        daily: days.map((date) => ({ date, bookings: daily.get(date)?.bookings ?? 0, cancelled: daily.get(date)?.cancelled ?? 0, revenue: money(daily.get(date)?.revenue ?? 0) })),
        stations: shownStations
            .map((st) => {
            const r = stationStats.get(String(st._id));
            return {
                stationId: String(st._id),
                code: st.code,
                name: st.name,
                category: categoryName.get(String(st.categoryId)) ?? '',
                bookings: r?.bookings ?? 0,
                hoursBooked: Math.round(((r?.minutes ?? 0) / 60) * 10) / 10,
                revenue: money(r?.revenue ?? 0),
                utilization: rate(r?.minutes ?? 0, availableMinutesPerStation),
            };
        })
            .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || a.code.localeCompare(b.code)),
        categories: categoryDocs
            .map((c) => {
            const r = categoryStats.get(String(c._id));
            return { categoryId: String(c._id), name: c.name, bookings: r?.bookings ?? 0, hoursBooked: Math.round(((r?.minutes ?? 0) / 60) * 10) / 10, revenue: money(r?.revenue ?? 0), share: rate(r?.bookings ?? 0, s.counted) };
        })
            .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings),
        peakHours: Array.from({ length: hourCount }, (_, i) => {
            const hour = (openHour + i) % 24;
            return { hour, bookings: hourStats.get(hour) ?? 0 };
        }),
        weekdays: Array.from({ length: 7 }, (_, day) => ({ day, bookings: weekdayStats.get(day) ?? 0 })),
        paymentMethods: facets.methods.map((r) => ({ method: r._id, bookings: r.bookings, revenue: money(r.revenue) })).sort((a, b) => b.revenue - a.revenue),
        sources: facets.sources.map((r) => ({ source: r._id, bookings: r.bookings, revenue: money(r.revenue) })),
        promos: facets.promos.map((r) => ({ code: r._id, uses: r.uses, discount: money(r.discount), revenue: money(r.revenue) })),
        topCustomers: facets.topCustomers.map((r) => {
            const u = customerName.get(String(r._id));
            return { customerId: String(r._id), name: u?.name ?? 'Customer', phone: u?.phone, bookings: r.bookings, spent: money(r.spent) };
        }),
    };
}
/* ------------------------------------------------------------------- export */
const isPlaceholderEmail = (e) => !e || e.toLowerCase().endsWith('@walkin.invalid');
async function bookingRows(scope, from, to) {
    const rows = await Booking.find({ businessId: scope.businessId, bookingDate: { $gte: from, $lte: to } })
        .sort({ bookingDate: 1, startTime: 1 })
        .limit(MAX_EXPORT_ROWS + 1)
        .populate('stationId', 'code')
        .populate('categoryId', 'name')
        .populate('customerId', 'name phone email')
        .select('-remindersSent -adminNotes')
        .lean();
    return rows;
}
const nested = (row, key, field) => (row[key]?.[field] ?? '');
const BOOKING_COLUMNS = [
    { header: 'Booking number', value: (r) => r.bookingNumber },
    { header: 'Date', value: (r) => r.bookingDate },
    { header: 'Start', value: (r) => r.startTime },
    { header: 'End', value: (r) => r.endTime },
    { header: 'Minutes', value: (r) => r.durationMinutes },
    { header: 'Station', value: (r) => nested(r, 'stationId', 'code') },
    { header: 'Category', value: (r) => nested(r, 'categoryId', 'name') },
    { header: 'Customer', value: (r) => nested(r, 'customerId', 'name') },
    { header: 'Phone', value: (r) => nested(r, 'customerId', 'phone') },
    { header: 'Email', value: (r) => (isPlaceholderEmail(nested(r, 'customerId', 'email')) ? '' : nested(r, 'customerId', 'email')) },
    { header: 'Players', value: (r) => r.numberOfPlayers },
    { header: 'Status', value: (r) => r.bookingStatus },
    { header: 'Payment status', value: (r) => r.paymentStatus },
    { header: 'Payment method', value: (r) => r.paymentMethod },
    { header: 'Source', value: (r) => r.source },
    { header: 'Promo code', value: (r) => r.promoCode ?? '' },
    { header: 'Base amount', value: (r) => r.baseAmount },
    { header: 'Discount', value: (r) => r.discountAmount },
    { header: 'Tax', value: (r) => r.taxAmount },
    { header: 'Total', value: (r) => r.totalAmount },
    { header: 'Overtime minutes', value: (r) => r.overtimeMinutes ?? 0 },
    { header: 'Created', value: (r) => r.createdAt },
];
async function paymentRows(scope, from, to) {
    return Booking.aggregate([
        { $match: { businessId: new Types.ObjectId(scope.businessId), bookingDate: { $gte: from, $lte: to } } },
        { $lookup: { from: Payment.collection.name, localField: '_id', foreignField: 'bookingId', as: 'payment' } },
        { $unwind: '$payment' },
        { $lookup: { from: User.collection.name, localField: 'customerId', foreignField: '_id', as: 'customer' } },
        { $sort: { bookingDate: 1, startTime: 1, 'payment.createdAt': 1 } },
        { $limit: MAX_EXPORT_ROWS + 1 },
        {
            $project: {
                bookingNumber: 1,
                bookingDate: 1,
                customer: { $arrayElemAt: ['$customer.name', 0] },
                method: '$payment.method',
                status: '$payment.status',
                amount: '$payment.amount',
                reference: '$payment.transactionReference',
                paidAt: '$payment.paidAt',
                created: '$payment.createdAt',
                rejectionReason: '$payment.rejectionReason',
            },
        },
    ]);
}
const PAYMENT_COLUMNS = [
    { header: 'Booking number', value: (r) => r.bookingNumber },
    { header: 'Booking date', value: (r) => r.bookingDate },
    { header: 'Customer', value: (r) => r.customer ?? '' },
    { header: 'Method', value: (r) => r.method },
    { header: 'Status', value: (r) => r.status },
    { header: 'Amount', value: (r) => r.amount },
    { header: 'Reference', value: (r) => r.reference ?? '' },
    { header: 'Created', value: (r) => r.created },
    { header: 'Paid at', value: (r) => r.paidAt ?? null },
    { header: 'Rejection reason', value: (r) => r.rejectionReason ?? '' },
];
async function customerRows(scope, from, to) {
    return Booking.aggregate([
        ...enrichedBookings(scope.businessId, from, to),
        { $match: { counted: true } },
        { $group: { _id: '$customerId', bookings: { $sum: 1 }, minutes: { $sum: '$durationMinutes' }, spent: { $sum: '$earned' }, first: { $min: '$bookingDate' }, last: { $max: '$bookingDate' } } },
        { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
        { $sort: { spent: -1, bookings: -1 } },
        { $limit: MAX_EXPORT_ROWS + 1 },
        { $project: { bookings: 1, minutes: 1, spent: 1, first: 1, last: 1, name: { $arrayElemAt: ['$user.name', 0] }, phone: { $arrayElemAt: ['$user.phone', 0] }, email: { $arrayElemAt: ['$user.email', 0] } } },
    ]);
}
const CUSTOMER_COLUMNS = [
    { header: 'Customer', value: (r) => r.name ?? '' },
    { header: 'Phone', value: (r) => r.phone ?? '' },
    { header: 'Email', value: (r) => (isPlaceholderEmail(r.email) ? '' : r.email) },
    { header: 'Bookings', value: (r) => r.bookings },
    { header: 'Hours booked', value: (r) => Math.round((r.minutes / 60) * 10) / 10 },
    { header: 'Amount paid', value: (r) => money(r.spent) },
    { header: 'First booking', value: (r) => r.first },
    { header: 'Last booking', value: (r) => r.last },
];
const REVENUE_COLUMNS = [
    { header: 'Date', value: (r) => r.date },
    { header: 'Bookings', value: (r) => r.bookings },
    { header: 'Cancelled', value: (r) => r.cancelled },
    { header: 'Revenue', value: (r) => r.revenue },
];
/** A CSV of the same period the report shows. Refuses (rather than silently truncating) if it would be too large. */
export async function exportCsv(businessId, kind, q) {
    const scope = await loadScope(businessId);
    const { from, to } = resolveRange(q, scope.timezone);
    let rows;
    let columns;
    switch (kind) {
        case 'bookings':
            [rows, columns] = [await bookingRows(scope, from, to), BOOKING_COLUMNS];
            break;
        case 'payments':
            [rows, columns] = [await paymentRows(scope, from, to), PAYMENT_COLUMNS];
            break;
        case 'customers':
            [rows, columns] = [await customerRows(scope, from, to), CUSTOMER_COLUMNS];
            break;
        case 'revenue':
            [rows, columns] = [(await getReport(businessId, { from, to })).daily, REVENUE_COLUMNS];
            break;
    }
    if (rows.length > MAX_EXPORT_ROWS)
        throw new ValidationError(`That is more than ${MAX_EXPORT_ROWS.toLocaleString('en-US')} rows. Choose a shorter period.`);
    return { filename: `${kind}-${from}_to_${to}.csv`, csv: toCsv(rows, columns), rows: rows.length, from, to };
}
//# sourceMappingURL=report.service.js.map