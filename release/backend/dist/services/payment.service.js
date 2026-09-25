import { Booking, Business, Payment } from '../models/index.js';
import { ConflictError, NotFoundError, PaymentError, ValidationError } from '../utils/errors.js';
import { detectFileType, mimeForKey } from '../utils/fileType.js';
import { roundMoney } from '../utils/currency.js';
import { escapeRegex, paginate, sortSpec } from '../utils/queryBuilder.js';
import { runInTransaction } from '../utils/transaction.js';
import { notifyBookingEvent } from '../helpers/notification.helper.js';
import { audit } from './audit.service.js';
import { createNotification } from './notification.service.js';
import { getPaymentProvider } from './payment.provider.js';
import { getEffectiveSettings } from './availability.service.js';
import { storage, storeKey } from './storage.service.js';
import { publishBooking, publishPayment } from './socket.service.js';
/* ------------------------------------------------------------------ access */
/** Loads a payment only if the actor may see it; otherwise "not found" (so payment ids cannot be probed). */
export async function findAccessiblePayment(id, actor, opts = {}) {
    let scope;
    if (actor.role === 'CUSTOMER')
        scope = { customerId: actor.id };
    else if (actor.role === 'SUPER_ADMIN')
        scope = actor.businessId ? { businessId: actor.businessId } : {};
    else
        scope = { businessId: { $in: actor.businessIds.filter((b) => !actor.businessId || b === actor.businessId) } };
    const query = Payment.findOne({ _id: id, ...scope });
    if (opts.withProof)
        query.select('+proofImage');
    const payment = await query;
    if (!payment)
        throw new NotFoundError('Payment not found');
    return payment;
}
/* ------------------------------------------------- booking <-> payment sync */
/**
 * The ONE place a booking's paymentStatus is derived from its payment rows:
 *   collected >= total -> PAID | collected > 0 -> PARTIAL | only refunds -> REFUNDED
 *   otherwise: a pending row -> PENDING, else the latest failure (REJECTED / FAILED).
 * A booking that was waiting only for payment is confirmed the moment it is fully paid.
 */
export async function recomputeBookingPayment(bookingId, session) {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking)
        throw new NotFoundError('Booking not found');
    const payments = await Payment.find({ bookingId }).session(session).select('amount status').lean();
    const sum = (status) => roundMoney(payments.filter((p) => p.status === status).reduce((s, p) => s + p.amount, 0));
    const paid = sum('PAID');
    const refunded = sum('REFUNDED');
    const has = (status) => payments.some((p) => p.status === status);
    let next;
    if (paid >= booking.totalAmount && (paid > 0 || booking.totalAmount === 0))
        next = 'PAID';
    else if (paid > 0)
        next = 'PARTIAL';
    else if (refunded > 0)
        next = 'REFUNDED';
    else if (has('PENDING'))
        next = 'PENDING';
    else if (has('REJECTED'))
        next = 'REJECTED';
    else if (has('FAILED'))
        next = 'FAILED';
    else
        next = booking.paymentStatus;
    booking.paymentStatus = next;
    booking.amountPaid = paid;
    let confirmedNow = false;
    if (next === 'PAID' && booking.bookingStatus === 'PENDING') {
        booking.bookingStatus = 'CONFIRMED';
        confirmedNow = true;
    }
    await booking.save({ session });
    return { booking, confirmedNow };
}
const RUNNING = ['PENDING', 'CONFIRMED'];
function assertBookingOpen(status) {
    if (!RUNNING.includes(status))
        throw new ConflictError('This booking can no longer be paid for', 'BOOKING_CLOSED');
}
/* ------------------------------------------------------------ store info */
/** Bank details a customer needs to pay by transfer. Signed-in customers only; never on the public store page. */
export async function getPaymentInfo(slug) {
    const business = await Business.findOne({ slug, status: 'ACTIVE' }).select('name currency bankDetails').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const settings = await getEffectiveSettings(business._id);
    return {
        store: business.name,
        currency: business.currency,
        bankTransferEnabled: settings.allowBankTransfer,
        bankDetails: settings.allowBankTransfer ? (business.bankDetails ?? null) : null,
    };
}
/* ------------------------------------------------------- bank transfer proof */
export async function submitProof(paymentId, file, input, actor, req) {
    if (!file)
        throw new ValidationError('Attach a photo or PDF of your payment', [{ path: 'proof', message: 'required' }]);
    const payment = await findAccessiblePayment(paymentId, actor);
    if (payment.method !== 'BANK_TRANSFER')
        throw new ConflictError('Proof can only be uploaded for bank transfers', 'WRONG_METHOD');
    if (payment.status !== 'PENDING' && payment.status !== 'REJECTED') {
        throw new ConflictError('This payment has already been settled', 'PAYMENT_ALREADY_PROCESSED');
    }
    const booking = await Booking.findById(payment.bookingId).select('bookingStatus bookingNumber bookingDate startTime endTime businessId customerId').lean();
    if (!booking)
        throw new NotFoundError('Booking not found');
    assertBookingOpen(booking.bookingStatus);
    // What the bytes are decides, not what the client claims.
    const detected = detectFileType(file.buffer);
    if (!detected)
        throw new ValidationError('That file is not a JPEG, PNG, WebP or PDF', [{ path: 'proof', message: 'unsupported file type' }]);
    const store = await Business.findById(payment.businessId).select('slug').lean();
    if (!store)
        throw new NotFoundError('Store not found');
    const key = storeKey(store.slug, 'payments', detected.ext); // "<store>/payments/<id>.png"
    await storage.put(key, file.buffer);
    let previousKey;
    try {
        await runInTransaction(async (session) => {
            const before = await Payment.findOneAndUpdate({ _id: payment._id, method: 'BANK_TRANSFER', status: { $in: ['PENDING', 'REJECTED'] } }, {
                $set: { proofImage: key, proofUploadedAt: new Date(), status: 'PENDING', ...(input.transactionReference && { transactionReference: input.transactionReference }) },
                $unset: { rejectionReason: '' },
            }, { session, returnDocument: 'before' }).select('+proofImage');
            if (!before)
                throw new ConflictError('This payment has already been settled', 'PAYMENT_ALREADY_PROCESSED');
            previousKey = before.proofImage ?? undefined;
            await recomputeBookingPayment(payment.bookingId, session);
        });
    }
    catch (err) {
        await storage.delete(key); // do not leave an orphaned file behind
        throw err;
    }
    if (previousKey)
        await storage.delete(previousKey);
    await audit({ action: 'PAYMENT_PROOF_SUBMITTED', entity: 'Payment', entityId: payment._id, businessId: payment.businessId, userId: actor.id, req: req, metadata: { bookingNumber: booking.bookingNumber, size: file.size, type: detected.mime } });
    await notifyBookingEvent('PAYMENT_PENDING', booking, { detail: 'A payment proof was submitted and is waiting for review.' });
    publishPayment('payment:updated', payment._id);
    publishBooking('booking:updated', payment.bookingId);
    return getPaymentView(payment._id);
}
/** The stored proof for a payment, for authorized viewers only. */
export async function getProof(paymentId, actor) {
    const payment = await findAccessiblePayment(paymentId, actor, { withProof: true });
    if (!payment.proofImage)
        throw new NotFoundError('No proof was uploaded for this payment');
    const data = await storage.get(payment.proofImage);
    const mime = mimeForKey(payment.proofImage);
    if (!data || !mime)
        throw new NotFoundError('Proof file not found');
    return { data, mime, filename: `payment-proof-${String(payment._id)}.${payment.proofImage.split('.').pop()}` };
}
/** How long a link to a receipt keeps working once it has been handed to an authorized viewer. */
export const PROOF_LINK_SECONDS = 60;
/**
 * For an authorized viewer, a short-lived link that shows the receipt straight from file storage (Cloudinary), so the picture
 * comes from there and not through this server. `url` is null when the storage cannot make such links: the caller then reads
 * the bytes from `getProof` instead.
 */
export async function getProofLink(paymentId, actor) {
    const payment = await findAccessiblePayment(paymentId, actor, { withProof: true });
    if (!payment.proofImage)
        throw new NotFoundError('No proof was uploaded for this payment');
    if (!storage.temporaryUrl)
        return { url: null, expiresInSeconds: 0 };
    const url = await storage.temporaryUrl(payment.proofImage, PROOF_LINK_SECONDS);
    if (!url)
        throw new NotFoundError('Proof file not found');
    return { url, expiresInSeconds: PROOF_LINK_SECONDS };
}
/* ------------------------------------------------------------ admin review */
export async function approvePayment(paymentId, actor, req) {
    const payment = await findAccessiblePayment(paymentId, actor);
    const now = new Date();
    const { booking, confirmedNow } = await runInTransaction(async (session) => {
        // The status guard makes approve atomic: of two simultaneous approvals exactly one succeeds.
        const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: 'PENDING' }, { $set: { status: 'PAID', paidAt: now, approvedBy: actor.id, reviewedBy: actor.id, reviewedAt: now }, $unset: { rejectionReason: '' } }, { session, returnDocument: 'after' });
        if (!updated)
            throw new ConflictError('This payment was already reviewed', 'PAYMENT_ALREADY_PROCESSED');
        return recomputeBookingPayment(payment.bookingId, session);
    });
    await audit({ action: 'PAYMENT_APPROVED', entity: 'Payment', entityId: payment._id, businessId: payment.businessId, userId: actor.id, req: req, metadata: { bookingNumber: booking.bookingNumber, amount: payment.amount, method: payment.method } });
    await notifyBookingEvent('PAYMENT_RECEIVED', booking, { audience: 'customer', detail: `${payment.amount} received.` });
    if (confirmedNow)
        await notifyBookingEvent('BOOKING_CONFIRMED', booking, { actorId: actor.id });
    publishPayment('payment:updated', payment._id);
    publishBooking(confirmedNow ? 'booking:confirmed' : 'booking:updated', payment.bookingId);
    return getPaymentView(payment._id);
}
export async function rejectPayment(paymentId, reason, actor, req) {
    const payment = await findAccessiblePayment(paymentId, actor);
    if (payment.method !== 'BANK_TRANSFER')
        throw new ConflictError('Only bank transfers can be rejected', 'WRONG_METHOD');
    const now = new Date();
    const { booking } = await runInTransaction(async (session) => {
        const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: 'PENDING' }, { $set: { status: 'REJECTED', rejectionReason: reason, reviewedBy: actor.id, reviewedAt: now } }, { session, returnDocument: 'after' });
        if (!updated)
            throw new ConflictError('This payment was already reviewed', 'PAYMENT_ALREADY_PROCESSED');
        return recomputeBookingPayment(payment.bookingId, session);
    });
    await audit({ action: 'PAYMENT_REJECTED', entity: 'Payment', entityId: payment._id, businessId: payment.businessId, userId: actor.id, req: req, metadata: { bookingNumber: booking.bookingNumber, reason } });
    await notifyBookingEvent('PAYMENT_FAILED', booking, { audience: 'customer', detail: `Reason: ${reason}. You can upload a new proof.` });
    publishPayment('payment:updated', payment._id);
    publishBooking('booking:updated', payment.bookingId);
    return getPaymentView(payment._id);
}
export async function refundPayment(paymentId, reason, actor, req) {
    const payment = await findAccessiblePayment(paymentId, actor);
    if (payment.status !== 'PAID')
        throw new ConflictError('Only a paid payment can be refunded', 'NOT_REFUNDABLE');
    // ONLINE payments go back through the gateway; cash / bank transfers are returned by the store, then recorded here.
    let refundReference;
    if (payment.method === 'ONLINE') {
        if (!payment.providerReference)
            throw new PaymentError('This payment has no gateway reference to refund');
        const result = await getPaymentProvider().refundPayment(payment.providerReference, payment.amount);
        if (result.status !== 'REFUNDED')
            throw new PaymentError('The payment provider did not accept the refund');
        refundReference = result.refundReference;
    }
    const { booking } = await runInTransaction(async (session) => {
        const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: 'PAID' }, { $set: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason, ...(refundReference && { refundReference }) } }, { session, returnDocument: 'after' });
        if (!updated)
            throw new ConflictError('This payment was already refunded', 'PAYMENT_ALREADY_PROCESSED');
        return recomputeBookingPayment(payment.bookingId, session);
    });
    await audit({ action: 'PAYMENT_REFUNDED', entity: 'Payment', entityId: payment._id, businessId: payment.businessId, userId: actor.id, req: req, metadata: { bookingNumber: booking.bookingNumber, amount: payment.amount, method: payment.method, reason: reason ?? null } });
    await createNotification({
        userId: payment.customerId,
        businessId: payment.businessId,
        type: 'SYSTEM_ALERT',
        title: 'Refund issued',
        message: `${payment.amount} for booking ${booking.bookingNumber} has been refunded.`,
        metadata: { bookingNumber: booking.bookingNumber },
    });
    publishPayment('payment:updated', payment._id);
    publishBooking('booking:updated', payment.bookingId);
    return getPaymentView(payment._id);
}
/* --------------------------------------------------------- online payments */
export async function startOnlinePayment(paymentId, actor) {
    const payment = await findAccessiblePayment(paymentId, actor);
    if (payment.method !== 'ONLINE')
        throw new ConflictError('This payment is not an online payment', 'WRONG_METHOD');
    if (payment.status !== 'PENDING' && payment.status !== 'FAILED')
        throw new ConflictError('This payment has already been settled', 'PAYMENT_ALREADY_PROCESSED');
    const booking = await Booking.findById(payment.bookingId).select('bookingStatus bookingNumber businessId').lean();
    if (!booking)
        throw new NotFoundError('Booking not found');
    assertBookingOpen(booking.bookingStatus);
    const business = await Business.findById(payment.businessId).select('currency').lean();
    const provider = getPaymentProvider();
    const created = await provider.createPayment({
        paymentId: String(payment._id),
        amount: payment.amount,
        currency: business?.currency ?? 'PKR',
        description: `Booking ${booking.bookingNumber}`,
    });
    await runInTransaction(async (session) => {
        const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: { $in: ['PENDING', 'FAILED'] } }, { $set: { status: 'PENDING', provider: provider.name, providerReference: created.reference }, $unset: { rejectionReason: '' } }, { session });
        if (!updated)
            throw new ConflictError('This payment has already been settled', 'PAYMENT_ALREADY_PROCESSED');
        await recomputeBookingPayment(payment.bookingId, session);
    });
    publishPayment('payment:updated', payment._id);
    publishBooking('booking:updated', payment.bookingId);
    return { reference: created.reference, provider: provider.name, simulated: provider.simulated, checkoutUrl: created.checkoutUrl ?? null, amount: payment.amount, currency: business?.currency ?? 'PKR' };
}
/**
 * Settles an online payment by asking the PROVIDER what happened. The browser only supplies the reference; it can
 * never declare a payment successful. Safe to call repeatedly.
 */
export async function verifyOnlinePayment(paymentId, input, actor, req) {
    const payment = await findAccessiblePayment(paymentId, actor);
    if (payment.method !== 'ONLINE')
        throw new ConflictError('This payment is not an online payment', 'WRONG_METHOD');
    if (payment.status === 'PAID')
        return { status: 'PAID', payment: await getPaymentView(payment._id) };
    if (!payment.providerReference)
        throw new ConflictError('Start the payment first', 'PAYMENT_NOT_STARTED');
    if (payment.providerReference !== input.reference)
        throw new ConflictError('That payment reference does not match', 'REFERENCE_MISMATCH');
    const provider = getPaymentProvider();
    const result = await provider.verifyPayment(input.reference, provider.simulated ? { outcome: input.outcome } : undefined);
    if (result.status === 'PENDING')
        return { status: 'PENDING', payment: await getPaymentView(payment._id) };
    if (result.status === 'PAID' && result.amount != null && roundMoney(result.amount) !== roundMoney(payment.amount)) {
        throw new PaymentError('The amount collected does not match the booking');
    }
    const now = new Date();
    const outcome = await runInTransaction(async (session) => {
        const updated = await Payment.findOneAndUpdate({ _id: payment._id, status: 'PENDING' }, result.status === 'PAID'
            ? { $set: { status: 'PAID', paidAt: now } }
            : { $set: { status: 'FAILED', rejectionReason: 'Payment was declined' } }, { session });
        if (!updated)
            return null; // settled concurrently by another verify call
        return recomputeBookingPayment(payment.bookingId, session);
    });
    if (outcome) {
        const { booking, confirmedNow } = outcome;
        await audit({ action: result.status === 'PAID' ? 'PAYMENT_PAID_ONLINE' : 'PAYMENT_FAILED_ONLINE', entity: 'Payment', entityId: payment._id, businessId: payment.businessId, userId: actor.id, req: req, metadata: { bookingNumber: booking.bookingNumber, provider: provider.name } });
        if (result.status === 'PAID') {
            await notifyBookingEvent('PAYMENT_RECEIVED', booking, { detail: `${payment.amount} received.` });
            if (confirmedNow)
                await notifyBookingEvent('BOOKING_CONFIRMED', booking, { detail: 'Your payment went through.' });
        }
        else {
            await notifyBookingEvent('PAYMENT_FAILED', booking, { audience: 'customer', detail: 'Your card payment was declined. You can try again.' });
        }
        publishPayment('payment:updated', payment._id);
        publishBooking(outcome.confirmedNow ? 'booking:confirmed' : 'booking:updated', payment.bookingId);
    }
    const fresh = await Payment.findById(payment._id).select('status').lean();
    return { status: (fresh?.status === 'PAID' ? 'PAID' : 'FAILED'), payment: await getPaymentView(payment._id) };
}
/* ----------------------------------------------------------------- reading */
const VIEW_POPULATE = [
    { path: 'bookingId', select: 'bookingNumber bookingDate startTime endTime totalAmount bookingStatus paymentStatus' },
    { path: 'customerId', select: 'name email phone' },
    { path: 'businessId', select: 'name slug currency' },
];
/** A payment as clients see it: never the storage key, only whether a proof exists. */
const toView = (p) => {
    const { proofImage: _key, ...rest } = p;
    return { ...rest, hasProof: Boolean(p.proofUploadedAt) };
};
export async function getPaymentView(id) {
    const p = await Payment.findById(id).populate(VIEW_POPULATE).lean();
    return toView(p);
}
export async function getAdminPayment(paymentId, actor) {
    const payment = await findAccessiblePayment(paymentId, actor);
    return getPaymentView(payment._id);
}
/** Payments of one store (`scope.businessId`) or of the whole platform (super admin, no business). */
export async function listPayments(scope, q) {
    const filter = {
        ...(scope.businessId ? { businessId: scope.businessId } : q.businessId ? { businessId: q.businessId } : {}),
        ...(q.status && { status: q.status }),
        ...(q.method && { method: q.method }),
        ...(q.needsReview === 'true' && { status: 'PENDING', proofUploadedAt: { $exists: true } }),
        ...(q.startDate || q.endDate ? { createdAt: { ...(q.startDate && { $gte: q.startDate }), ...(q.endDate && { $lte: q.endDate }) } } : {}),
    };
    if (q.search?.trim()) {
        const bookingScope = { bookingNumber: new RegExp(escapeRegex(q.search.trim()), 'i'), ...(filter.businessId ? { businessId: filter.businessId } : {}) };
        filter.bookingId = { $in: await Booking.distinct('_id', bookingScope) };
    }
    const page = await paginate(Payment, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['createdAt', 'amount', 'status', 'paidAt'], q.sortBy, q.sortOrder),
        populate: VIEW_POPULATE,
    });
    return { data: page.data.map(toView), pagination: page.pagination };
}
//# sourceMappingURL=payment.service.js.map