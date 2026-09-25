import { getReviewOfBooking } from './review.service.js';
import { Booking, Business, Payment, PromoCode, Station } from '../models/index.js';
import { BookingUnavailableError, ConflictError, ForbiddenError, NotFoundError, ValidationError, } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
import { localDate } from '../utils/dateTime.js';
import { generateBookingNumber } from '../utils/bookingNumber.js';
import { runInTransaction } from '../utils/transaction.js';
import { notifyBookingEvent } from '../helpers/notification.helper.js';
import { audit } from './audit.service.js';
import { assertBookable, getEffectiveSettings, isSlotFree, isStationBookable, validateBookingTime, } from './availability.service.js';
import { calculatePrice, redeemPromo } from './pricing.service.js';
import { publishBooking, publishPayment } from './socket.service.js';
const MODIFIABLE = ['PENDING', 'CONFIRMED'];
const NOT_BOOKABLE_STATUSES = ['MAINTENANCE', 'INACTIVE'];
/* ------------------------------------------------------------------ helpers */
/** Loads a booking only if the actor may see it. Anything else is "not found", so booking ids cannot be probed. */
export async function findAccessibleBooking(where, actor) {
    let scope;
    if (actor.role === 'CUSTOMER') {
        scope = { customerId: actor.id };
    }
    else if (actor.role === 'SUPER_ADMIN') {
        scope = actor.businessId ? { businessId: actor.businessId } : {};
    }
    else {
        const allowed = actor.businessIds.filter((id) => !actor.businessId || id === actor.businessId);
        scope = { businessId: { $in: allowed } };
    }
    const booking = await Booking.findOne({ ...where, ...scope });
    if (!booking)
        throw new NotFoundError('Booking not found');
    return booking;
}
/**
 * Serialises concurrent bookings of ONE station. Every booking write first modifies the station
 * document; a second transaction touching the same document gets a write conflict from MongoDB, is
 * retried, and on retry sees the first booking - so overlapping bookings cannot both commit.
 */
export async function lockStation(stationId, businessId, session) {
    const locked = await Station.findOneAndUpdate({ _id: stationId, businessId, active: true, status: { $nin: NOT_BOOKABLE_STATUSES } }, { $inc: { bookingVersion: 1 } }, { session, timestamps: false, returnDocument: 'after' });
    if (!locked)
        throw new ValidationError('This station is not available for booking');
    return locked;
}
function assertPaymentMethodAllowed(method, settings) {
    if (method === 'PAY_AT_VENUE') {
        if (!settings.allowPayAtVenue)
            throw new ValidationError('This store does not accept pay-at-venue bookings');
        if (settings.requireAdvancePayment)
            throw new ValidationError('This store requires advance payment');
    }
    if (method === 'BANK_TRANSFER' && !settings.allowBankTransfer) {
        throw new ValidationError('This store does not accept bank transfers');
    }
}
/** Customers may only change a booking until `minutes` before it starts. Staff are not restricted. */
function assertBeforeCutoff(booking, minutes, message) {
    if (booking.startDateTime.getTime() - Date.now() < minutes * 60_000) {
        throw new ConflictError(`${message} up to ${minutes} minutes before the start time`, 'CUTOFF_PASSED');
    }
}
const POPULATE = [
    { path: 'stationId', select: 'code name capacity' },
    { path: 'categoryId', select: 'name slug' },
    { path: 'businessId', select: 'name slug timezone currency address city phone whatsapp logo coverImage' },
    { path: 'customerId', select: 'name email phone' },
];
/** Fields only the store team may see. Customers never receive them. */
const STAFF_ONLY = '-adminNotes -remindersSent';
export async function presentBooking(id, opts = {}) {
    const [booking, payments, review] = await Promise.all([
        Booking.findById(id).select(opts.staff ? '' : STAFF_ONLY).populate(POPULATE).lean(),
        Payment.find({ bookingId: id }).select('amount method status paidAt createdAt transactionReference rejectionReason proofUploadedAt')
            .sort({ createdAt: 1 })
            .lean(),
        getReviewOfBooking(id),
    ]);
    // Never expose the proof's storage key; clients only learn whether one was uploaded.
    return { ...booking, review, payments: payments.map(({ proofUploadedAt, ...p }) => ({ ...p, hasProof: Boolean(proofUploadedAt) })) };
}
/**
 * Keeps payment records in step with a price change (reschedule / extension).
 *  - nothing collected yet: the pending payment simply follows the new total
 *  - already paid + price went up: a new PENDING payment is opened for the difference (booking -> PARTIAL)
 *  - already paid + price went down: nothing is refunded automatically; `refundDue` reports the amount
 */
export async function adjustPayments(booking, oldTotal, newTotal, session) {
    const difference = roundMoney(newTotal - oldTotal);
    if (difference === 0)
        return { difference: 0, refundDue: 0 };
    const collected = booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIAL';
    if (!collected) {
        const pending = await Payment.find({ bookingId: booking._id, status: 'PENDING' }).sort({ createdAt: 1 }).session(session);
        if (pending[0]) {
            pending[0].amount = newTotal;
            await pending[0].save({ session });
            await Payment.deleteMany({ _id: { $in: pending.slice(1).map((p) => p._id) } }, { session });
        }
        return { difference, refundDue: 0 };
    }
    if (difference > 0) {
        await Payment.create([{ bookingId: booking._id, businessId: booking.businessId, customerId: booking.customerId, amount: difference, method: booking.paymentMethod, status: 'PENDING' }], { session });
        booking.paymentStatus = 'PARTIAL';
    }
    return { difference, refundDue: difference < 0 ? -difference : 0 };
}
export async function createBooking(input, ctx, req) {
    const business = await Business.findOne({ slug: input.businessSlug }).lean();
    if (!business)
        throw new NotFoundError('Store not found');
    assertBookable(business);
    const businessId = String(business._id);
    const settings = await getEffectiveSettings(businessId);
    const station = await Station.findOne({ _id: input.stationId, businessId }).lean();
    if (!station)
        throw new NotFoundError('Station not found');
    if (!isStationBookable(station))
        throw new ValidationError('This station is not available for booking');
    if (input.numberOfPlayers > station.capacity) {
        throw new ValidationError(`This station fits up to ${station.capacity} player(s)`);
    }
    // Walk-ins pay at the desk, so online-booking payment policies (advance payment, allowed methods) do not apply.
    if (ctx.source !== 'WALK_IN')
        assertPaymentMethodAllowed(input.paymentMethod, settings);
    const time = validateBookingTime({
        business,
        settings,
        date: input.date,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        allowStartedSlot: ctx.allowStartedSlot,
    });
    // Numbers come from an atomic counter outside the transaction: unique, and a lost race only leaves a gap.
    const bookingNumber = await generateBookingNumber(business, localDate(new Date(), business.timezone));
    const { booking, payment, quote } = await runInTransaction(async (session) => {
        await lockStation(station._id, businessId, session);
        if (!(await isSlotFree({ businessId, stationId: station._id, start: time.start, end: time.end, session }))) {
            throw new BookingUnavailableError();
        }
        const quote = await calculatePrice({
            businessId,
            stationId: String(station._id),
            start: time.start,
            durationMinutes: input.durationMinutes,
            promoCode: input.promoCode,
            session,
        });
        if (quote.promo)
            await redeemPromo(quote.promo.id, session);
        const free = quote.totalAmount === 0;
        const confirmed = free || ctx.autoConfirm || input.paymentMethod === 'PAY_AT_VENUE';
        const [booking] = await Booking.create([
            {
                businessId,
                bookingNumber,
                customerId: ctx.customerId,
                stationId: station._id,
                categoryId: station.categoryId,
                bookingDate: time.bookingDate,
                startTime: time.startTime,
                endTime: time.endTime,
                startDateTime: time.start,
                endDateTime: time.end,
                durationMinutes: input.durationMinutes,
                numberOfPlayers: input.numberOfPlayers,
                promoCode: quote.promo?.code,
                baseAmount: quote.baseAmount,
                discountAmount: quote.discountAmount,
                taxAmount: quote.taxAmount,
                totalAmount: quote.totalAmount,
                paymentMethod: input.paymentMethod,
                paymentStatus: free ? 'PAID' : 'PENDING',
                bookingStatus: confirmed ? 'CONFIRMED' : 'PENDING',
                customerNotes: input.customerNotes,
                source: ctx.source ?? 'ONLINE',
                createdBy: ctx.createdBy,
            },
        ], { session });
        const [payment] = await Payment.create([
            {
                bookingId: booking._id,
                businessId,
                customerId: ctx.customerId,
                amount: quote.totalAmount,
                method: input.paymentMethod,
                status: free ? 'PAID' : 'PENDING',
                paidAt: free ? new Date() : undefined,
            },
        ], { session });
        return { booking: booking, payment: payment, quote };
    });
    // Side effects only after the transaction has committed.
    await audit({
        action: 'BOOKING_CREATED',
        entity: 'Booking',
        entityId: booking._id,
        businessId,
        userId: ctx.createdBy,
        req,
        metadata: { bookingNumber, stationId: String(station._id), total: quote.totalAmount, source: ctx.source ?? 'ONLINE' },
    });
    await notifyBookingEvent(booking.bookingStatus === 'CONFIRMED' ? 'BOOKING_CONFIRMED' : 'BOOKING_CREATED', booking, {
        actorId: ctx.createdBy === ctx.customerId ? undefined : ctx.createdBy,
    });
    publishBooking('booking:created', booking._id);
    if (booking.bookingStatus === 'CONFIRMED')
        publishBooking('booking:confirmed', booking._id);
    publishPayment('payment:created', payment._id);
    return { booking: await presentBooking(booking._id, { staff: ctx.source === 'WALK_IN' }), pricing: quote };
}
export async function getBookingByNumber(bookingNumber, actor) {
    const booking = await findAccessibleBooking({ bookingNumber }, actor);
    return presentBooking(booking._id, { staff: actor.role !== 'CUSTOMER' });
}
/* ------------------------------------------------------------------ cancel */
export async function cancelBooking(bookingId, actor, reason, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (!MODIFIABLE.includes(booking.bookingStatus)) {
        throw new ConflictError(`A ${booking.bookingStatus.toLowerCase().replace('_', ' ')} booking cannot be cancelled`, 'INVALID_STATUS');
    }
    if (actor.role === 'CUSTOMER') {
        const settings = await getEffectiveSettings(booking.businessId);
        if (!settings.allowCancellation)
            throw new ForbiddenError('This store does not allow cancellations');
        assertBeforeCutoff(booking, settings.cancellationMinutes, 'Bookings can only be cancelled');
    }
    const refundRequired = booking.paymentStatus === 'PAID' || booking.paymentStatus === 'PARTIAL';
    await runInTransaction(async (session) => {
        const updated = await Booking.findOneAndUpdate({ _id: booking._id, bookingStatus: { $in: MODIFIABLE } }, {
            $set: {
                bookingStatus: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledBy: actor.id,
                cancellationReason: reason,
                ...(!refundRequired && { paymentStatus: 'FAILED' }),
            },
        }, { session, returnDocument: 'after' });
        if (!updated)
            throw new ConflictError('This booking was just changed. Please refresh and try again.', 'INVALID_STATUS');
        // Unpaid payment rows are closed; money already collected stays PAID until an admin refunds it.
        await Payment.updateMany({ bookingId: booking._id, status: 'PENDING' }, { $set: { status: 'FAILED', rejectionReason: 'Booking cancelled' } }, { session });
        if (booking.promoCode) {
            await PromoCode.updateOne({ businessId: booking.businessId, code: booking.promoCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
        }
    });
    await audit({
        action: 'BOOKING_CANCELLED',
        entity: 'Booking',
        entityId: booking._id,
        businessId: booking.businessId,
        req,
        metadata: { bookingNumber: booking.bookingNumber, reason: reason ?? null, cancelledBy: actor.role, refundRequired },
    });
    await notifyBookingEvent('BOOKING_CANCELLED', booking, { actorId: actor.id, detail: reason });
    publishBooking('booking:cancelled', booking._id);
    return { booking: await presentBooking(booking._id, { staff: actor.role !== 'CUSTOMER' }), refundRequired };
}
/* -------------------------------------------------------------- reschedule */
export async function rescheduleBooking(bookingId, input, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (!MODIFIABLE.includes(booking.bookingStatus)) {
        throw new ConflictError(`A ${booking.bookingStatus.toLowerCase().replace('_', ' ')} booking cannot be rescheduled`, 'INVALID_STATUS');
    }
    const businessId = String(booking.businessId);
    const [business, settings] = await Promise.all([Business.findById(businessId).lean(), getEffectiveSettings(businessId)]);
    if (!business)
        throw new NotFoundError('Store not found');
    assertBookable(business);
    const isCustomer = actor.role === 'CUSTOMER';
    if (isCustomer) {
        if (!settings.allowRescheduling)
            throw new ForbiddenError('This store does not allow rescheduling');
        assertBeforeCutoff(booking, settings.cancellationMinutes, 'Bookings can only be rescheduled');
    }
    const stationId = input.stationId ?? String(booking.stationId);
    const station = await Station.findOne({ _id: stationId, businessId }).lean();
    if (!station)
        throw new NotFoundError('Station not found');
    if (!isStationBookable(station))
        throw new ValidationError('This station is not available for booking');
    if (booking.numberOfPlayers > station.capacity)
        throw new ValidationError(`This station fits up to ${station.capacity} player(s)`);
    const durationMinutes = input.durationMinutes ?? booking.durationMinutes;
    const time = validateBookingTime({ business, settings, date: input.date, startTime: input.startTime, durationMinutes, allowStartedSlot: !isCustomer });
    if (String(station._id) === String(booking.stationId) && time.start.getTime() === booking.startDateTime.getTime() && durationMinutes === booking.durationMinutes) {
        throw new ValidationError('The booking is already at that time');
    }
    const from = { stationId: String(booking.stationId), date: booking.bookingDate, startTime: booking.startTime, durationMinutes: booking.durationMinutes, total: booking.totalAmount };
    const { adjustment, quote } = await runInTransaction(async (session) => {
        const current = await Booking.findOne({ _id: booking._id, bookingStatus: { $in: MODIFIABLE } }).session(session);
        if (!current)
            throw new ConflictError('This booking was just changed. Please refresh and try again.', 'INVALID_STATUS');
        await lockStation(station._id, businessId, session);
        if (!(await isSlotFree({ businessId, stationId: station._id, start: time.start, end: time.end, excludeBookingId: current._id, session }))) {
            throw new BookingUnavailableError();
        }
        const quote = await calculatePrice({
            businessId,
            stationId: String(station._id),
            start: time.start,
            durationMinutes,
            promoCode: current.promoCode ?? undefined,
            promoAlreadyRedeemed: true,
            session,
        });
        const oldTotal = current.totalAmount;
        current.set({
            stationId: station._id,
            categoryId: station.categoryId,
            bookingDate: time.bookingDate,
            startTime: time.startTime,
            endTime: time.endTime,
            startDateTime: time.start,
            endDateTime: time.end,
            durationMinutes,
            baseAmount: quote.baseAmount,
            discountAmount: quote.discountAmount,
            taxAmount: quote.taxAmount,
            totalAmount: quote.totalAmount,
            scheduledAt: new Date(), // reminders are counted from the moment the new slot was set
            remindersSent: [], // ...and must fire again for the new time
        });
        const adjustment = await adjustPayments(current, oldTotal, quote.totalAmount, session);
        await current.save({ session });
        return { adjustment, quote };
    });
    await audit({
        action: 'BOOKING_RESCHEDULED',
        entity: 'Booking',
        entityId: booking._id,
        businessId,
        req,
        metadata: {
            bookingNumber: booking.bookingNumber,
            from,
            to: { stationId: String(station._id), date: time.bookingDate, startTime: time.startTime, durationMinutes, total: quote.totalAmount },
            priceDifference: adjustment.difference,
        },
    });
    publishBooking('booking:rescheduled', booking._id, { previous: { stationId: from.stationId, date: from.date } });
    const updated = await presentBooking(booking._id, { staff: actor.role !== 'CUSTOMER' });
    await notifyBookingEvent('BOOKING_RESCHEDULED', { ...booking.toObject(), ...time, bookingDate: time.bookingDate }, { actorId: actor.id, detail: `Moved from ${from.date} ${from.startTime}.` });
    return { booking: updated, pricing: quote, priceDifference: adjustment.difference, refundDue: adjustment.refundDue };
}
//# sourceMappingURL=booking.service.js.map