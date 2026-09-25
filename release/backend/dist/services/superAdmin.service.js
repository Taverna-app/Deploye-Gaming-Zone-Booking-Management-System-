import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getDatabaseState, pingDatabase } from '../config/database.js';
import { checkSmtp } from '../config/smtp.js';
import { socketStatus } from '../config/socket.js';
import { getSchedulerStatus } from '../jobs/scheduler.js';
import { AuditLog, Booking, Business, GamingCategory, Payment, SystemSetting, User } from '../models/index.js';
import { localDate } from '../utils/dateTime.js';
import { dateRangeFilter, paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
/* ---------- platform settings ---------- */
export async function getSettings() {
    const settings = await SystemSetting.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true, returnDocument: 'after' }).lean();
    return settings;
}
/** Deep-merges nested groups so a partial update never wipes sibling keys. */
export async function updateSettings(input) {
    const $set = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined)
            continue;
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value))
                if (v !== undefined)
                    $set[`${key}.${k}`] = v;
        }
        else {
            $set[key] = value;
        }
    }
    return SystemSetting.findOneAndUpdate({ key: 'platform' }, { $set, $setOnInsert: { key: 'platform' } }, { upsert: true, returnDocument: 'after' }).lean();
}
/* ---------- dashboard ---------- */
/**
 * Platform dashboard. Everything is computed from the database. With `businessId` the same numbers
 * are scoped to one store (the store switcher). "Today" uses the platform default timezone.
 */
export async function getDashboard({ businessId, days }) {
    const settings = await getSettings();
    const tz = settings?.defaultTimezone ?? 'Asia/Karachi';
    const today = localDate(new Date(), tz);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceDate = localDate(since, tz);
    const bizId = businessId ? new mongoose.Types.ObjectId(businessId) : undefined;
    const scope = bizId ? { businessId: bizId } : {};
    const activeBookings = { ...scope, bookingStatus: { $nin: ['CANCELLED'] } };
    const paidPayments = { ...scope, status: 'PAID' };
    const [totalZones, activeZones, totalBookings, todaysBookings, customerIds, revenueAgg, bookingsOverTime, revenueOverTime, bookingsByBusinessAgg, categoriesAgg, recentStores, recentBookings, suspended, expired, pendingPayments,] = await Promise.all([
        Business.countDocuments(bizId ? { _id: bizId } : {}),
        Business.countDocuments({ ...(bizId ? { _id: bizId } : {}), status: 'ACTIVE' }),
        Booking.countDocuments(scope),
        Booking.countDocuments({ ...activeBookings, bookingDate: today }),
        Booking.distinct('customerId', scope),
        Payment.aggregate([{ $match: paidPayments }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Booking.aggregate([
            { $match: { ...activeBookings, bookingDate: { $gte: sinceDate } } },
            { $group: { _id: '$bookingDate', bookings: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]),
        Payment.aggregate([
            { $match: { ...paidPayments, paidAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: tz } }, revenue: { $sum: '$amount' } } },
            { $sort: { _id: 1 } },
        ]),
        Booking.aggregate([
            { $match: activeBookings },
            { $group: { _id: '$businessId', bookings: { $sum: 1 } } },
            { $sort: { bookings: -1 } },
            { $limit: 10 },
        ]),
        Booking.aggregate([
            { $match: activeBookings },
            { $group: { _id: '$categoryId', bookings: { $sum: 1 } } },
            { $sort: { bookings: -1 } },
            { $limit: 20 },
        ]),
        Business.find(bizId ? { _id: bizId } : {}).sort({ createdAt: -1 }).limit(5).select('name slug city status subscriptionStatus createdAt').lean(),
        Booking.find(scope)
            .sort({ createdAt: -1 })
            .limit(8)
            .select('bookingNumber businessId stationId bookingDate startTime endTime totalAmount bookingStatus paymentStatus')
            .populate('businessId', 'name')
            .populate('stationId', 'code')
            .lean(),
        Business.countDocuments({ ...(bizId ? { _id: bizId } : {}), status: 'SUSPENDED' }),
        Business.countDocuments({ ...(bizId ? { _id: bizId } : {}), subscriptionStatus: 'EXPIRED' }),
        Payment.countDocuments({ ...scope, status: 'PENDING', method: 'BANK_TRANSFER' }),
    ]);
    const businessNames = new Map((await Business.find({ _id: { $in: bookingsByBusinessAgg.map((b) => b._id) } }).select('name').lean()).map((b) => [String(b._id), b.name]));
    const categoryNames = new Map((await GamingCategory.find({ _id: { $in: categoriesAgg.map((c) => c._id) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
    // Categories with the same name across stores are merged into one "popular category".
    const popular = new Map();
    for (const c of categoriesAgg) {
        const name = categoryNames.get(String(c._id)) ?? 'Unknown';
        popular.set(name, (popular.get(name) ?? 0) + c.bookings);
    }
    const alerts = [
        { level: 'warning', code: 'SUSPENDED_BUSINESSES', count: suspended, message: `${suspended} suspended business(es)` },
        { level: 'warning', code: 'EXPIRED_SUBSCRIPTIONS', count: expired, message: `${expired} expired subscription(s)` },
        { level: 'info', code: 'PENDING_BANK_TRANSFERS', count: pendingPayments, message: `${pendingPayments} bank transfer(s) awaiting approval` },
    ].filter((a) => a.count > 0);
    return {
        cards: {
            totalZones,
            activeZones,
            totalBookings,
            todaysBookings,
            totalCustomers: customerIds.length,
            totalRevenue: revenueAgg[0]?.total ?? 0,
        },
        charts: {
            bookingsOverTime: bookingsOverTime.map((r) => ({ date: r._id, bookings: r.bookings })),
            revenueOverTime: revenueOverTime.map((r) => ({ date: r._id, revenue: r.revenue })),
            bookingsByBusiness: bookingsByBusinessAgg.map((b) => ({
                businessId: String(b._id),
                name: businessNames.get(String(b._id)) ?? 'Unknown',
                bookings: b.bookings,
            })),
            popularCategories: [...popular.entries()]
                .map(([name, bookings]) => ({ name, bookings }))
                .sort((a, b) => b.bookings - a.bookings)
                .slice(0, 8),
        },
        recentStores,
        recentBookings,
        alerts,
        range: { days, since: sinceDate, today, timezone: tz },
    };
}
/* ---------- users & audit logs ---------- */
export async function listUsers(q) {
    const filter = {
        ...searchFilter(['name', 'email', 'phone'], q.search),
        ...(q.role && { role: q.role }),
        ...(q.businessId && { businessIds: q.businessId }),
        ...(q.isActive && { isActive: q.isActive === 'true' }),
        ...dateRangeFilter('createdAt', q.startDate, q.endDate),
    };
    return paginate(User, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['name', 'email', 'role', 'createdAt', 'lastLoginAt'], q.sortBy, q.sortOrder),
        select: 'name email phone role businessIds isActive isEmailVerified lastLoginAt createdAt',
    });
}
export async function listAuditLogs(q) {
    const filter = {
        ...searchFilter(['action', 'entity', 'entityId'], q.search),
        ...(q.businessId && { businessId: q.businessId }),
        ...(q.userId && { userId: q.userId }),
        ...(q.action && { action: q.action }),
        ...(q.entity && { entity: q.entity }),
        ...dateRangeFilter('createdAt', q.startDate, q.endDate),
    };
    return paginate(AuditLog, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['createdAt', 'action', 'entity'], q.sortBy, q.sortOrder),
        populate: [
            { path: 'userId', select: 'name email role' },
            { path: 'businessId', select: 'name slug' },
        ],
    });
}
const SMTP_CHECK_TIMEOUT_MS = 5_000;
/** SMTP verification can hang on a bad host, so the health page never waits longer than a few seconds for it. */
async function smtpStatus() {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve('ERROR'), SMTP_CHECK_TIMEOUT_MS);
    });
    try {
        return await Promise.race([checkSmtp(), timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Live status of every moving part. Statuses and job outcomes only: never hosts, credentials or connection strings. */
export async function getSystemHealth() {
    const [dbOk, email] = await Promise.all([pingDatabase(), smtpStatus()]);
    const realtime = socketStatus();
    const scheduler = getSchedulerStatus();
    const database = dbOk ? 'CONNECTED' : getDatabaseState() === 'CONNECTING' ? 'DISCONNECTED' : 'ERROR';
    const services = { api: 'CONNECTED', database, email, realtime: realtime.status, scheduler: scheduler.status };
    return {
        overall: services.database !== 'CONNECTED' ? 'DOWN' : Object.values(services).every((s) => s === 'CONNECTED') ? 'HEALTHY' : 'DEGRADED',
        services,
        details: {
            uptimeSeconds: Math.round(process.uptime()),
            environment: env.NODE_ENV,
            realtimeClients: realtime.clients,
            jobs: scheduler.jobs,
        },
        checkedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=superAdmin.service.js.map