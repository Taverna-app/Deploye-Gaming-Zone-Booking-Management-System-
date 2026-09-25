import { Types } from 'mongoose';
import { Booking, CustomerNote, Payment, User } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
import { buildPagination, clampPaging } from '../utils/pagination.js';
import { escapeRegex } from '../utils/queryBuilder.js';
import { audit } from './audit.service.js';
/**
 * A store's customers are the people who have at least one booking AT THAT STORE. A customer's bookings, spending and
 * contact details at other stores are never part of what one store sees.
 */
/** A search matching more people than this (say "a") is filtered after the totals instead of before them. */
const MAX_PREFILTER = 5000;
const isPlaceholderEmail = (e) => !e || e.toLowerCase().endsWith('@walkin.invalid');
/** Per-customer totals over ALL of this store's bookings, with what was actually received for each. */
function totalsPipeline(businessId, customerId, customerIds) {
    return [
        {
            $match: {
                businessId: new Types.ObjectId(businessId),
                ...(customerId && { customerId: new Types.ObjectId(customerId) }),
                ...(customerIds && { customerId: { $in: customerIds } }),
            },
        },
        {
            $group: {
                _id: '$customerId',
                bookings: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'COMPLETED'] }, 1, 0] } },
                cancelled: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'CANCELLED'] }, 1, 0] } },
                noShow: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'NO_SHOW'] }, 1, 0] } },
                // A cancelled booking's payment is money to give back, not spending.
                spent: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'CANCELLED'] }, 0, { $ifNull: ['$amountPaid', 0] }] } },
                firstVisit: { $min: '$bookingDate' },
                lastVisit: { $max: '$bookingDate' },
            },
        },
    ];
}
const view = (t, u) => ({
    _id: String(u._id),
    name: u.name,
    phone: u.phone ?? null,
    email: isPlaceholderEmail(u.email) ? null : u.email,
    isWalkIn: Boolean(u.isWalkIn),
    bookings: t.bookings,
    completed: t.completed,
    cancelled: t.cancelled,
    noShow: t.noShow,
    spent: roundMoney(t.spent),
    firstVisit: t.firstVisit,
    lastVisit: t.lastVisit,
});
export async function listStoreCustomers(businessId, q) {
    const { page, limit, skip } = clampPaging(q.page, q.limit);
    const sortKey = q.sortBy ?? 'lastVisit';
    const sortField = sortKey === 'name' ? 'user.name' : sortKey;
    const direction = (q.sortBy ? q.sortOrder : 'desc') === 'asc' ? 1 : -1;
    const rx = q.search?.trim() ? new RegExp(escapeRegex(q.search.trim()), 'i') : null;
    const userFilter = {
        ...(q.walkIn && { isWalkIn: q.walkIn === 'true' ? true : { $ne: true } }),
        ...(rx && { $or: [{ name: rx }, { email: rx }, { phone: rx }] }),
    };
    const filtered = Object.keys(userFilter).length > 0;
    // Fast path: find the matching people first, so only their bookings are added up, and look up only the page's users.
    // Sorting by name needs every name, so it takes the slower path below.
    if (sortKey !== 'name') {
        let ids = null;
        if (filtered) {
            const found = await User.find({ role: 'CUSTOMER', ...userFilter }).select('_id').limit(MAX_PREFILTER + 1).lean();
            ids = found.length <= MAX_PREFILTER ? found.map((u) => u._id) : null;
        }
        if (!filtered || ids) {
            const [result] = await Booking.aggregate([
                ...totalsPipeline(businessId, undefined, ids ?? undefined),
                { $facet: { rows: [{ $sort: { [sortField]: direction, _id: 1 } }, { $skip: skip }, { $limit: limit }], count: [{ $count: 'n' }] } },
            ]);
            const rows = result?.rows ?? [];
            const users = await User.find({ _id: { $in: rows.map((r) => r._id) } }).select('name phone email isWalkIn').lean();
            const byId = new Map(users.map((u) => [String(u._id), u]));
            const data = rows.flatMap((r) => (byId.has(String(r._id)) ? [view(r, byId.get(String(r._id)))] : []));
            return { data, pagination: buildPagination(page, limit, result?.count[0]?.n ?? 0) };
        }
    }
    const [result] = await Booking.aggregate([
        ...totalsPipeline(businessId),
        { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
            $match: {
                ...(q.walkIn && { 'user.isWalkIn': q.walkIn === 'true' ? true : { $ne: true } }),
                ...(rx && { $or: [{ 'user.name': rx }, { 'user.email': rx }, { 'user.phone': rx }] }),
            },
        },
        {
            $facet: {
                rows: [{ $sort: { [sortField]: direction, _id: 1 } }, { $skip: skip }, { $limit: limit }],
                count: [{ $count: 'n' }],
            },
        },
    ]);
    const total = result?.count[0]?.n ?? 0;
    return { data: (result?.rows ?? []).map((r) => view(r, r.user)), pagination: buildPagination(page, limit, total) };
}
export async function getStoreCustomer(businessId, customerId) {
    const [totals] = await Booking.aggregate(totalsPipeline(businessId, customerId));
    if (!totals)
        throw new NotFoundError('Customer not found'); // never booked here: not this store's customer
    const user = await User.findById(customerId).select('name phone email isWalkIn createdAt isActive').lean();
    if (!user)
        throw new NotFoundError('Customer not found');
    const [bookings, payments, note] = await Promise.all([
        Booking.find({ businessId, customerId })
            .sort({ startDateTime: -1 })
            .limit(30)
            .select('bookingNumber bookingDate startTime endTime bookingStatus paymentStatus paymentMethod totalAmount source stationId')
            .populate('stationId', 'code')
            .lean(),
        Payment.find({ businessId, customerId }).sort({ createdAt: -1 }).limit(30).select('bookingId amount method status paidAt createdAt').populate('bookingId', 'bookingNumber').lean(),
        CustomerNote.findOne({ businessId, customerId }).select('text updatedAt').lean(),
    ]);
    return {
        customer: { ...view(totals, user), joinedAt: user.createdAt, isActive: user.isActive },
        notes: note ? { text: note.text, updatedAt: note.updatedAt } : null,
        bookings,
        payments,
    };
}
export async function setCustomerNote(businessId, customerId, text, req) {
    if (!(await Booking.exists({ businessId, customerId })))
        throw new NotFoundError('Customer not found');
    if (text === '')
        await CustomerNote.deleteOne({ businessId, customerId });
    else
        await CustomerNote.updateOne({ businessId, customerId }, { $set: { text, updatedBy: req.user?.id } }, { upsert: true });
    // The note's words are private and are not copied into the audit log.
    await audit({ action: text === '' ? 'CUSTOMER_NOTE_REMOVED' : 'CUSTOMER_NOTE_SAVED', entity: 'User', entityId: customerId, businessId, req });
    return { notes: text === '' ? null : { text, updatedAt: new Date() } };
}
//# sourceMappingURL=customerAdmin.service.js.map