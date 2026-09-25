import { randomBytes } from 'node:crypto';
import { Booking, Business, Payment, Station, User } from '../models/index.js';
import { ACTIVE_BOOKING_STATUSES } from '../types/enums.js';
import { ConflictError, ForbiddenError, NotFoundError, PricingError, ValidationError } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
import { localTime } from '../utils/dateTime.js';
import { normalizePhone } from '../utils/phone.js';
import { hashPassword } from '../utils/password.js';
import { escapeRegex, paginate, sortSpec } from '../utils/queryBuilder.js';
import { runInTransaction } from '../utils/transaction.js';
import { businessDayWindow } from '../helpers/availability.helper.js';
import { notifyBookingEvent } from '../helpers/notification.helper.js';
import { audit } from './audit.service.js';
import { getEffectiveSettings, isSlotFree } from './availability.service.js';
import { adjustPayments, createBooking, findAccessibleBooking, lockStation, presentBooking } from './booking.service.js';
import { createNotification } from './notification.service.js';
import { approvePayment, recomputeBookingPayment } from './payment.service.js';
import { calculatePrice } from './pricing.service.js';
import { publishBooking } from './socket.service.js';
/** Customers may be checked in this long before their start time... */
export const CHECK_IN_EARLY_MINUTES = 60;
/** ...and staying up to this long past the end is free; after that overtime is billed at check-out. */
export const OVERTIME_GRACE_MINUTES = 5;
const staffView = (id) => presentBooking(id, { staff: true });
/* ------------------------------------------------------------ cash handling */
/**
 * Records cash taken at the desk for a PAY_AT_VENUE booking by settling its pending payments through the normal
 * approval path (so audit, notifications and the booking's payment status all stay consistent). Desk staff may do
 * this for cash only; bank transfers and online payments still need an admin / the gateway.
 */
async function collectCash(bookingId, actor, req) {
    const pending = await Payment.find({ bookingId, status: 'PENDING', method: 'PAY_AT_VENUE' }).select('_id').lean();
    for (const p of pending)
        await approvePayment(String(p._id), actor, req);
    return pending.length;
}
/* ------------------------------------------------------------------ walk-ins */
async function resolveWalkInCustomer(c) {
    if (c.customerId) {
        const existing = await User.findOne({ _id: c.customerId, role: 'CUSTOMER', isActive: true });
        if (!existing)
            throw new NotFoundError('Customer not found');
        return { user: existing, created: false };
    }
    if (c.email) {
        const byEmail = await User.findOne({ email: c.email });
        if (byEmail) {
            if (byEmail.role !== 'CUSTOMER')
                throw new ConflictError('That email belongs to a staff account', 'EMAIL_TAKEN');
            if (!byEmail.isActive)
                throw new ConflictError('This customer account is disabled', 'ACCOUNT_DISABLED');
            return { user: byEmail, created: false };
        }
    }
    const phone = c.phone ? normalizePhone(c.phone) : undefined;
    if (phone) {
        const byPhone = await User.findOne({ role: 'CUSTOMER', phone, isActive: true });
        if (byPhone)
            return { user: byPhone, created: false };
    }
    // Nobody matches: create the customer at the desk. With no email a placeholder is used; the account cannot sign in
    // (random unknown password) until the customer claims it through "forgot password" with a real email.
    const user = await User.create({
        name: c.name,
        email: c.email ?? `walkin-${randomBytes(8).toString('hex')}@walkin.invalid`,
        phone,
        passwordHash: await hashPassword(randomBytes(32).toString('hex')),
        role: 'CUSTOMER',
        isWalkIn: true,
    });
    return { user, created: true };
}
/** Same booking engine as online bookings (availability, pricing, double-booking protection), driven by staff. */
export async function createWalkIn(businessId, input, actor, req) {
    const business = await Business.findById(businessId).select('slug').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const settings = await getEffectiveSettings(businessId);
    if (!settings.allowWalkIn)
        throw new ForbiddenError('Walk-in bookings are turned off for this store');
    const { user: customer, created: customerCreated } = await resolveWalkInCustomer(input.customer);
    let created;
    try {
        created = await createBooking({
            businessSlug: business.slug,
            stationId: input.stationId,
            date: input.date,
            startTime: input.startTime,
            durationMinutes: input.durationMinutes,
            numberOfPlayers: input.numberOfPlayers,
            paymentMethod: input.paymentMethod,
            promoCode: input.promoCode,
        }, { customerId: String(customer._id), createdBy: actor.id, source: 'WALK_IN', allowStartedSlot: true, autoConfirm: true }, req);
    }
    catch (err) {
        // A customer record made just for this attempt must not be left behind when the booking is refused (e.g. slot taken).
        if (customerCreated)
            await User.deleteOne({ _id: customer._id }).catch(() => undefined);
        throw err;
    }
    const { booking, pricing } = created;
    if (input.notes)
        await Booking.updateOne({ _id: booking._id }, { $set: { adminNotes: input.notes } });
    let cashCollected = false;
    if (input.paidNow && input.paymentMethod === 'PAY_AT_VENUE')
        cashCollected = (await collectCash(booking._id, actor, req)) > 0;
    return { booking: await staffView(booking._id), pricing, cashCollected, customerCreated };
}
/* ------------------------------------------------------------------- reading */
export async function listAdminBookings(businessId, q) {
    const filter = {
        businessId,
        ...(q.bookingStatus && { bookingStatus: q.bookingStatus }),
        ...(q.paymentStatus && { paymentStatus: q.paymentStatus }),
        ...(q.stationId && { stationId: q.stationId }),
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...(q.customerId && { customerId: q.customerId }),
        ...(q.source && { source: q.source }),
        ...(q.date && { bookingDate: q.date }),
        ...(q.startDate || q.endDate ? { startDateTime: { ...(q.startDate && { $gte: q.startDate }), ...(q.endDate && { $lte: q.endDate }) } } : {}),
    };
    const term = q.search?.trim();
    if (term) {
        const rx = new RegExp(escapeRegex(term), 'i');
        const customers = await User.find({ role: 'CUSTOMER', $or: [{ name: rx }, { email: rx }, { phone: rx }] })
            .select('_id')
            .limit(100)
            .lean();
        filter.$or = [{ bookingNumber: rx }, { customerId: { $in: customers.map((c) => c._id) } }];
    }
    return paginate(Booking, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['startDateTime', 'createdAt', 'totalAmount', 'bookingStatus', 'bookingNumber'], q.sortBy, q.sortOrder, { startDateTime: -1 }),
        select: '-remindersSent',
        populate: [
            { path: 'stationId', select: 'code name' },
            { path: 'categoryId', select: 'name slug' },
            { path: 'customerId', select: 'name email phone isWalkIn' },
        ],
    });
}
export async function getAdminBooking(bookingId, actor) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    return staffView(booking._id);
}
/* ------------------------------------------------------------ simple updates */
export async function updateAdminBooking(bookingId, input, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    const updates = {};
    if (input.adminNotes !== undefined)
        updates.adminNotes = input.adminNotes;
    if (input.numberOfPlayers !== undefined) {
        if (!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(booking.bookingStatus)) {
            throw new ConflictError('The player count can only be changed on a live booking', 'INVALID_STATUS');
        }
        const station = await Station.findById(booking.stationId).select('capacity').lean();
        if (station && input.numberOfPlayers > station.capacity)
            throw new ValidationError(`This station fits up to ${station.capacity} player(s)`);
        updates.numberOfPlayers = input.numberOfPlayers;
    }
    await Booking.updateOne({ _id: booking._id }, { $set: updates });
    await audit({ action: 'BOOKING_UPDATED', entity: 'Booking', entityId: booking._id, businessId: booking.businessId, req, metadata: { bookingNumber: booking.bookingNumber, fields: Object.keys(updates) } });
    publishBooking('booking:updated', booking._id);
    return staffView(booking._id);
}
/** Manually confirm a booking that is waiting (e.g. the store verified a payment by phone). */
export async function confirmBooking(bookingId, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, bookingStatus: 'PENDING' }, { $set: { bookingStatus: 'CONFIRMED' } }, { returnDocument: 'after' });
    if (!updated)
        throw new ConflictError('Only a pending booking can be confirmed', 'INVALID_STATUS');
    await audit({ action: 'BOOKING_CONFIRMED', entity: 'Booking', entityId: booking._id, businessId: booking.businessId, req, metadata: { bookingNumber: booking.bookingNumber, paymentStatus: updated.paymentStatus } });
    await notifyBookingEvent('BOOKING_CONFIRMED', updated, { actorId: actor.id });
    publishBooking('booking:confirmed', booking._id);
    return staffView(booking._id);
}
/* --------------------------------------------------------------- check-in/out */
export async function checkIn(bookingId, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (booking.bookingStatus === 'PENDING') {
        throw new ConflictError('This booking is still waiting for payment. Confirm it first.', 'PAYMENT_NOT_CONFIRMED');
    }
    if (booking.bookingStatus !== 'CONFIRMED') {
        throw new ConflictError(`A ${booking.bookingStatus.toLowerCase().replace('_', ' ')} booking cannot be checked in`, 'INVALID_STATUS');
    }
    const now = new Date();
    if (now.getTime() < booking.startDateTime.getTime() - CHECK_IN_EARLY_MINUTES * 60_000) {
        throw new ConflictError(`Check-in opens ${CHECK_IN_EARLY_MINUTES} minutes before the start time`, 'TOO_EARLY');
    }
    if (now >= booking.endDateTime)
        throw new ConflictError('This booking has already ended', 'BOOKING_ENDED');
    await runInTransaction(async (session) => {
        const current = await Booking.findOne({ _id: booking._id, bookingStatus: 'CONFIRMED' }).session(session);
        if (!current)
            throw new ConflictError('This booking was just changed. Please refresh.', 'INVALID_STATUS');
        // Same per-station lock the booking engine uses: concurrent check-ins on one station cannot both succeed.
        // Only the "not bookable" outcome is translated; transient DB errors must propagate so the transaction retries.
        const station = await lockStation(current.stationId, String(current.businessId), session).catch((err) => {
            if (err instanceof ValidationError)
                throw new ConflictError('This station is under maintenance or inactive', 'STATION_UNAVAILABLE');
            throw err;
        });
        const busy = await Booking.exists({ stationId: station._id, bookingStatus: 'CHECKED_IN', _id: { $ne: current._id } }).session(session);
        if (busy)
            throw new ConflictError('Another session is still running on this station. Check it out first.', 'STATION_OCCUPIED');
        current.bookingStatus = 'CHECKED_IN';
        current.checkedInAt = now;
        await current.save({ session });
        await Station.updateOne({ _id: station._id }, { $set: { status: 'OCCUPIED' } }, { session, timestamps: false });
    });
    await audit({ action: 'BOOKING_CHECKED_IN', entity: 'Booking', entityId: booking._id, businessId: booking.businessId, req, metadata: { bookingNumber: booking.bookingNumber, stationId: String(booking.stationId) } });
    await notifyBookingEvent('SESSION_STARTED', booking, { actorId: actor.id });
    publishBooking('booking:checked-in', booking._id, { stationStatus: true });
    return staffView(booking._id);
}
export async function checkOut(bookingId, input, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (booking.bookingStatus !== 'CHECKED_IN') {
        throw new ConflictError('Only a checked-in booking can be checked out', 'INVALID_STATUS');
    }
    const now = new Date();
    const warnings = [];
    let overtime = null;
    if (input.chargeOvertime) {
        const overMinutes = (now.getTime() - booking.endDateTime.getTime()) / 60_000;
        if (overMinutes > OVERTIME_GRACE_MINUTES) {
            // Round up to the store's slot length and price it with the normal engine (peak rates etc. apply).
            const { slotIntervalMinutes: step } = await getEffectiveSettings(booking.businessId);
            const minutes = Math.ceil(overMinutes / step) * step;
            try {
                overtime = { minutes, quote: await calculatePrice({ businessId: String(booking.businessId), stationId: String(booking.stationId), start: booking.endDateTime, durationMinutes: minutes }) };
            }
            catch (err) {
                if (!(err instanceof PricingError))
                    throw err;
                warnings.push('Overtime could not be priced, so none was charged.');
            }
        }
    }
    await runInTransaction(async (session) => {
        const current = await Booking.findOne({ _id: booking._id, bookingStatus: 'CHECKED_IN' }).session(session);
        if (!current)
            throw new ConflictError('This booking was just changed. Please refresh.', 'INVALID_STATUS');
        const oldTotal = current.totalAmount;
        current.bookingStatus = 'COMPLETED';
        current.checkedOutAt = now;
        if (overtime) {
            current.overtimeMinutes = (current.overtimeMinutes ?? 0) + overtime.minutes;
            current.baseAmount = roundMoney(current.baseAmount + overtime.quote.baseAmount);
            current.taxAmount = roundMoney(current.taxAmount + overtime.quote.taxAmount);
            current.totalAmount = roundMoney(current.totalAmount + overtime.quote.totalAmount);
            await adjustPayments(current, oldTotal, current.totalAmount, session);
        }
        await current.save({ session });
        await Station.updateOne({ _id: current.stationId, status: 'OCCUPIED' }, { $set: { status: 'AVAILABLE' } }, { session, timestamps: false });
    });
    let cashCollected = false;
    if (input.collectPayment && booking.paymentMethod === 'PAY_AT_VENUE')
        cashCollected = (await collectCash(booking._id, actor, req)) > 0;
    await audit({
        action: 'BOOKING_CHECKED_OUT',
        entity: 'Booking',
        entityId: booking._id,
        businessId: booking.businessId,
        req,
        metadata: { bookingNumber: booking.bookingNumber, overtimeMinutes: overtime?.minutes ?? 0, overtimeAmount: overtime?.quote.totalAmount ?? 0, cashCollected },
    });
    await notifyBookingEvent('SESSION_COMPLETED', booking, { actorId: actor.id, detail: overtime ? `Includes ${overtime.minutes} min of overtime.` : undefined });
    publishBooking('booking:checked-out', booking._id, { stationStatus: true });
    return {
        booking: await staffView(booking._id),
        overtime: overtime ? { minutes: overtime.minutes, amount: overtime.quote.totalAmount } : null,
        cashCollected,
        warnings,
    };
}
/* ------------------------------------------------------------------ extension */
/**
 * Extends a running session. It is refused if the next booking on that station would be squeezed (same overlap
 * check and per-station lock as a new booking) or if it would run past closing time.
 */
export async function extendBooking(bookingId, input, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (booking.bookingStatus !== 'CHECKED_IN')
        throw new ConflictError('Only a running (checked-in) session can be extended', 'INVALID_STATUS');
    const businessId = String(booking.businessId);
    const [business, settings] = await Promise.all([Business.findById(businessId).select('timezone openingTime closingTime').lean(), getEffectiveSettings(businessId)]);
    if (!business)
        throw new NotFoundError('Store not found');
    if (input.extraMinutes % settings.slotIntervalMinutes !== 0)
        throw new ValidationError(`Extend in multiples of ${settings.slotIntervalMinutes} minutes`);
    if (booking.durationMinutes + input.extraMinutes > settings.maximumBookingMinutes) {
        throw new ValidationError(`A session cannot exceed ${settings.maximumBookingMinutes} minutes in total`);
    }
    const { close } = businessDayWindow(booking.bookingDate, business.openingTime, business.closingTime, business.timezone);
    const { quote, newEnd, difference } = await runInTransaction(async (session) => {
        const current = await Booking.findOne({ _id: booking._id, bookingStatus: 'CHECKED_IN' }).session(session);
        if (!current)
            throw new ConflictError('This session was just changed. Please refresh.', 'INVALID_STATUS');
        const newEnd = new Date(current.endDateTime.getTime() + input.extraMinutes * 60_000);
        if (newEnd > close)
            throw new ConflictError(`That would run past closing time (${business.closingTime})`, 'PAST_CLOSING');
        await lockStation(current.stationId, businessId, session);
        if (!(await isSlotFree({ businessId, stationId: current.stationId, start: current.endDateTime, end: newEnd, excludeBookingId: current._id, session }))) {
            const blocker = await Booking.findOne({
                businessId,
                stationId: current.stationId,
                _id: { $ne: current._id },
                bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
                startDateTime: { $lt: newEnd },
                endDateTime: { $gt: current.endDateTime },
            })
                .sort({ startDateTime: 1 })
                .session(session)
                .select('startTime')
                .lean();
            throw new ConflictError(`Cannot extend: another booking starts at ${blocker?.startTime ?? 'that time'}`, 'EXTENSION_BLOCKED');
        }
        const quote = await calculatePrice({ businessId, stationId: String(current.stationId), start: current.endDateTime, durationMinutes: input.extraMinutes, session });
        const oldTotal = current.totalAmount;
        current.endDateTime = newEnd;
        current.endTime = localTime(newEnd, business.timezone);
        current.durationMinutes += input.extraMinutes;
        current.baseAmount = roundMoney(current.baseAmount + quote.baseAmount);
        current.taxAmount = roundMoney(current.taxAmount + quote.taxAmount);
        current.totalAmount = roundMoney(current.totalAmount + quote.totalAmount);
        const adjustment = await adjustPayments(current, oldTotal, current.totalAmount, session);
        await current.save({ session });
        return { quote, newEnd, difference: adjustment.difference };
    });
    let cashCollected = false;
    if (input.collectPayment && booking.paymentMethod === 'PAY_AT_VENUE')
        cashCollected = (await collectCash(booking._id, actor, req)) > 0;
    await audit({ action: 'BOOKING_EXTENDED', entity: 'Booking', entityId: booking._id, businessId, req, metadata: { bookingNumber: booking.bookingNumber, extraMinutes: input.extraMinutes, amount: difference, cashCollected } });
    await notifyBookingEvent('BOOKING_RESCHEDULED', { ...booking.toObject(), endTime: localTime(newEnd, business.timezone) }, { actorId: actor.id, detail: `Session extended by ${input.extraMinutes} minutes.` });
    publishBooking('booking:updated', booking._id);
    return { booking: await staffView(booking._id), extraMinutes: input.extraMinutes, extensionAmount: quote.totalAmount, priceDifference: difference, cashCollected };
}
/* -------------------------------------------------------------------- no-show */
export async function markNoShow(bookingId, reason, actor, req) {
    const booking = await findAccessibleBooking({ _id: bookingId }, actor);
    if (!['PENDING', 'CONFIRMED'].includes(booking.bookingStatus)) {
        throw new ConflictError('Only a booking that has not started can be marked as a no-show', 'INVALID_STATUS');
    }
    if (new Date() < booking.startDateTime)
        throw new ConflictError('The booking has not started yet', 'TOO_EARLY');
    const noShowReason = reason?.trim() || 'Customer did not arrive';
    const done = await settleNoShow(booking, noShowReason, { req });
    if (!done)
        throw new ConflictError('This booking was just changed. Please refresh.', 'INVALID_STATUS');
    return staffView(booking._id);
}
/**
 * Turns a booking that never started into a no-show: money already collected is kept, anything still owed is closed
 * (the slot frees up on its own because NO_SHOW bookings never block availability), then the customer is told.
 * Shared by the desk's button and the automatic job. Returns false if the booking changed under us.
 */
export async function settleNoShow(booking, noShowReason, opts = {}) {
    const done = await runInTransaction(async (session) => {
        const updated = await Booking.findOneAndUpdate({ _id: booking._id, bookingStatus: { $in: ['PENDING', 'CONFIRMED'] } }, { $set: { bookingStatus: 'NO_SHOW', noShowReason } }, { session });
        if (!updated)
            return false;
        await Payment.updateMany({ bookingId: booking._id, status: 'PENDING' }, { $set: { status: 'FAILED', rejectionReason: 'No-show' } }, { session });
        await recomputeBookingPayment(booking._id, session);
        return true;
    });
    if (!done)
        return false;
    await audit({
        action: 'BOOKING_NO_SHOW',
        entity: 'Booking',
        entityId: booking._id,
        businessId: booking.businessId,
        req: opts.req,
        metadata: { bookingNumber: booking.bookingNumber, reason: noShowReason, ...(opts.automatic && { automatic: true }) },
    });
    await createNotification({
        userId: booking.customerId,
        businessId: booking.businessId,
        type: 'SYSTEM_ALERT',
        title: 'Missed booking',
        message: `You did not arrive for booking ${booking.bookingNumber}. It has been marked as a no-show.`,
        metadata: { bookingNumber: booking.bookingNumber, bookingId: String(booking._id) },
    });
    publishBooking('booking:updated', booking._id);
    return true;
}
//# sourceMappingURL=bookingOps.service.js.map