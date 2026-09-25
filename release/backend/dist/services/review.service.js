import { Types } from 'mongoose';
import { Booking, Business, Review, User } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { buildPagination, clampPaging } from '../utils/pagination.js';
import { paginate, sortSpec } from '../utils/queryBuilder.js';
import { audit } from './audit.service.js';
import { createNotification } from './notification.service.js';
const EMPTY = { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
/** "Ali Raza" -> "Ali R.": the public sees a first name and an initial, never a full name, phone or email. */
export function publicName(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return 'Customer';
    const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
    return `${parts[0]}${last}`;
}
/** Star averages of APPROVED reviews only, for one or many stores in one query. */
export async function ratingSummaries(businessIds) {
    const out = new Map();
    if (businessIds.length === 0)
        return out;
    const rows = await Review.aggregate([
        { $match: { businessId: { $in: businessIds.map((id) => new Types.ObjectId(String(id))) }, status: 'APPROVED' } },
        { $group: { _id: { b: '$businessId', r: '$rating' }, n: { $sum: 1 } } },
        { $project: { _id: '$_id.b', rating: '$_id.r', n: 1 } },
    ]);
    for (const row of rows) {
        const key = String(row._id);
        const s = out.get(key) ?? { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
        s.distribution[row.rating - 1] = (s.distribution[row.rating - 1] ?? 0) + row.n;
        s.count += row.n;
        out.set(key, s);
    }
    for (const s of out.values())
        s.average = Math.round((s.distribution.reduce((sum, n, i) => sum + n * (i + 1), 0) / s.count) * 10) / 10;
    return out;
}
export const summaryFor = (map, id) => map.get(String(id)) ?? EMPTY;
/* ------------------------------------------------------------------ customer */
const mine = (r) => ({ _id: String(r._id), rating: r.rating, comment: r.comment ?? '', status: r.status, createdAt: r.createdAt });
/** A customer may review a booking of theirs once it is COMPLETED, and only once. */
export async function createReview(customerId, input) {
    const booking = await Booking.findOne({ _id: input.bookingId, customerId }).select('businessId bookingStatus bookingNumber').lean();
    if (!booking)
        throw new NotFoundError('Booking not found');
    if (booking.bookingStatus !== 'COMPLETED')
        throw new ValidationError('You can review a booking once your session is completed');
    let review;
    try {
        review = await Review.create({ businessId: booking.businessId, customerId, bookingId: booking._id, rating: input.rating, comment: input.comment || undefined });
    }
    catch (err) {
        if (err.code === 11000)
            throw new ConflictError('You have already reviewed this booking', 'ALREADY_REVIEWED');
        throw err;
    }
    // Tell the store's admins, in the app. The text of the review is not copied into the notification.
    const [admins, customer] = await Promise.all([User.find({ role: 'STORE_ADMIN', isActive: true, businessIds: booking.businessId }).select('_id').lean(), User.findById(customerId).select('name').lean()]);
    await Promise.all(admins.map((a) => createNotification({
        userId: a._id,
        businessId: booking.businessId,
        type: 'REVIEW_RECEIVED',
        title: `New ${input.rating}-star review`,
        message: `${publicName(customer?.name ?? 'A customer')} reviewed booking ${booking.bookingNumber}.`,
        metadata: { bookingNumber: booking.bookingNumber, rating: input.rating },
    })));
    return mine(review.toObject());
}
/** Editing keeps a hidden review hidden: a customer cannot un-hide their own review by editing it. */
export async function updateReview(customerId, reviewId, input) {
    const review = await Review.findOneAndUpdate({ _id: reviewId, customerId }, { $set: { ...(input.rating !== undefined && { rating: input.rating }), ...(input.comment !== undefined && { comment: input.comment }) } }, { returnDocument: 'after', runValidators: true }).lean();
    if (!review)
        throw new NotFoundError('Review not found');
    return mine(review);
}
export async function getReviewOfBooking(bookingId) {
    const review = await Review.findOne({ bookingId }).select('rating comment status createdAt').lean();
    return review ? mine(review) : null;
}
/* -------------------------------------------------------------------- public */
export async function listPublicReviews(slug, q) {
    const business = await Business.findOne({ slug, status: 'ACTIVE' }).select('_id').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const { page, limit, skip } = clampPaging(q.page, q.limit);
    const filter = { businessId: business._id, status: 'APPROVED' };
    const [rows, total, summaries] = await Promise.all([
        Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('rating comment createdAt customerId').populate('customerId', 'name').lean(),
        Review.countDocuments(filter),
        ratingSummaries([business._id]),
    ]);
    return {
        summary: summaryFor(summaries, business._id),
        reviews: rows.map((r) => ({ _id: String(r._id), rating: r.rating, comment: r.comment ?? '', createdAt: r.createdAt, author: publicName(r.customerId?.name ?? '') })),
        pagination: buildPagination(page, limit, total),
    };
}
/* --------------------------------------------------------------------- admin */
export async function listAdminReviews(businessId, q) {
    const page = await paginate(Review, { businessId, ...(q.status && { status: q.status }), ...(q.rating && { rating: q.rating }) }, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['createdAt', 'rating'], q.sortBy, q.sortOrder),
        populate: [
            { path: 'customerId', select: 'name' },
            { path: 'bookingId', select: 'bookingNumber bookingDate' },
        ],
    });
    return { data: page.data.map((r) => ({ _id: String(r._id), rating: r.rating, comment: r.comment ?? '', status: r.status, createdAt: r.createdAt, customer: r.customerId?.name ?? 'Customer', bookingNumber: r.bookingId?.bookingNumber, bookingDate: r.bookingId?.bookingDate })), pagination: page.pagination };
}
export async function moderateReview(businessId, reviewId, status, req) {
    const review = await Review.findOneAndUpdate({ _id: reviewId, businessId }, { $set: { status } }, { returnDocument: 'after' }).lean();
    if (!review)
        throw new NotFoundError('Review not found');
    await audit({ action: status === 'REJECTED' ? 'REVIEW_HIDDEN' : 'REVIEW_RESTORED', entity: 'Review', entityId: reviewId, businessId, req });
    return { _id: String(review._id), status: review.status };
}
//# sourceMappingURL=review.service.js.map