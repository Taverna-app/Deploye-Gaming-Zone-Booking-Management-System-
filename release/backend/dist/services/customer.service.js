import { Booking, Payment, User } from '../models/index.js';
import { ACTIVE_BOOKING_STATUSES } from '../types/enums.js';
import { NotFoundError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
import { audit } from './audit.service.js';
/** A customer's own bookings. Always scoped by `customerId` from the authenticated user. */
export async function listBookings(customerId, q) {
    const now = new Date();
    const views = {
        upcoming: { bookingStatus: { $in: ACTIVE_BOOKING_STATUSES }, endDateTime: { $gt: now } },
        past: { $or: [{ bookingStatus: { $in: ['COMPLETED', 'NO_SHOW'] } }, { bookingStatus: { $in: ACTIVE_BOOKING_STATUSES }, endDateTime: { $lte: now } }] },
        cancelled: { bookingStatus: 'CANCELLED' },
        all: {},
    };
    const filter = {
        customerId,
        ...views[q.view],
        ...searchFilter(['bookingNumber'], q.search),
    };
    // Upcoming reads best soonest-first; everything else newest-first.
    const fallback = q.view === 'upcoming' ? { startDateTime: 1 } : { startDateTime: -1 };
    return paginate(Booking, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['startDateTime', 'createdAt', 'totalAmount', 'bookingStatus'], q.sortBy, q.sortOrder, fallback),
        select: '-adminNotes -remindersSent',
        populate: [
            { path: 'stationId', select: 'code name' },
            { path: 'categoryId', select: 'name slug' },
            { path: 'businessId', select: 'name slug city timezone currency logo' },
        ],
    });
}
export async function listPayments(customerId, q) {
    const filter = { customerId, ...(q.status && { status: q.status }) };
    return paginate(Payment, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['createdAt', 'amount', 'status'], q.sortBy, q.sortOrder),
        select: 'bookingId businessId amount method status paidAt createdAt rejectionReason', // never proof images / approver
        populate: [
            { path: 'bookingId', select: 'bookingNumber bookingDate startTime endTime' },
            { path: 'businessId', select: 'name slug currency' },
        ],
    });
}
export async function getProfile(userId) {
    const user = await User.findById(userId);
    if (!user)
        throw new NotFoundError('User not found');
    return user.toJSON();
}
export async function updateProfile(userId, input, req) {
    const updates = {};
    const unset = {};
    if (input.name !== undefined)
        updates.name = input.name;
    if (input.phone !== undefined) {
        if (input.phone === '')
            unset.phone = '';
        else
            updates.phone = normalizePhone(input.phone);
    }
    const user = await User.findByIdAndUpdate(userId, { ...(Object.keys(updates).length && { $set: updates }), ...(Object.keys(unset).length && { $unset: unset }) }, { returnDocument: 'after', runValidators: true });
    if (!user)
        throw new NotFoundError('User not found');
    await audit({ action: 'PROFILE_UPDATED', entity: 'User', entityId: userId, userId, req, metadata: { fields: Object.keys(input) } });
    return user.toJSON();
}
//# sourceMappingURL=customer.service.js.map