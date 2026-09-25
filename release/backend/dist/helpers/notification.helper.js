import { User } from '../models/User.js';
import { createNotification } from '../services/notification.service.js';
import { sendBookingEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';
import { runInBackground } from '../utils/background.js';
import { loadBookingContext } from './bookingContext.js';
const COPY = {
    BOOKING_CREATED: { customer: 'Booking received', staff: 'New booking' },
    BOOKING_CONFIRMED: { customer: 'Booking confirmed', staff: 'Booking confirmed' },
    BOOKING_CANCELLED: { customer: 'Booking cancelled', staff: 'Booking cancelled' },
    BOOKING_RESCHEDULED: { customer: 'Booking rescheduled', staff: 'Booking rescheduled' },
    BOOKING_REMINDER: { customer: 'Upcoming booking', staff: 'Upcoming booking' },
    PAYMENT_RECEIVED: { customer: 'Payment received', staff: 'Payment received' },
    PAYMENT_PENDING: { customer: 'Payment proof received', staff: 'Payment proof to review' },
    PAYMENT_FAILED: { customer: 'Payment not accepted', staff: 'Payment not accepted' },
    SESSION_STARTED: { customer: 'Session started', staff: 'Session started' },
    SESSION_COMPLETED: { customer: 'Session completed', staff: 'Session completed' },
};
/** Which customer email each notification type produces (types not listed are in-app only). */
const EMAIL_KIND = {
    BOOKING_CREATED: 'CREATED',
    BOOKING_CONFIRMED: 'CONFIRMED',
    BOOKING_CANCELLED: 'CANCELLED',
    BOOKING_RESCHEDULED: 'RESCHEDULED',
    BOOKING_REMINDER: 'REMINDER',
    PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
};
/** Which WhatsApp message a staff member can send about each event (a deep link, opened by a person). */
const WHATSAPP_KIND = {
    BOOKING_CONFIRMED: 'CONFIRMATION',
    BOOKING_CANCELLED: 'CANCELLATION',
    BOOKING_RESCHEDULED: 'RESCHEDULE',
    BOOKING_REMINDER: 'REMINDER',
};
/**
 * The single fan-out point for booking / payment events:
 *   - in-app notification for the customer and/or each active admin and staff member (never the person who acted),
 *   - a customer email in the background (delivery recorded as an EMAIL notification, SENT or FAILED),
 *   - WhatsApp deep links in the notification metadata: staff get a link to message the customer, customers get a
 *     link to message the store. Nothing is sent automatically over WhatsApp.
 * Real-time (Socket.IO) delivery hooks in through createNotification.
 */
export async function notifyBookingEvent(type, booking, opts = {}) {
    const copy = COPY[type];
    if (!copy)
        return;
    const audience = opts.audience ?? 'both';
    const summary = `${booking.bookingNumber} - ${booking.bookingDate} ${booking.startTime}-${booking.endTime}`;
    const message = opts.detail ? `${summary}. ${opts.detail}` : summary;
    const base = { bookingId: String(booking._id), bookingNumber: booking.bookingNumber };
    let ctx = null;
    try {
        ctx = await loadBookingContext(booking._id);
    }
    catch (err) {
        logger.warn('Notification sent without message links', { error: err.message });
    }
    const waKind = WHATSAPP_KIND[type];
    const customerMeta = { ...base, ...(ctx?.whatsappEnabled && ctx.toStoreLink && { whatsappUrl: ctx.toStoreLink }) };
    const staffLink = ctx?.whatsappEnabled && waKind ? ctx.toCustomerLink(waKind) : null;
    const staffMeta = { ...base, ...(staffLink && { whatsappUrl: staffLink }) };
    const staff = audience === 'customer'
        ? []
        : await User.find({ businessIds: booking.businessId, role: { $in: ['STORE_ADMIN', 'STAFF'] }, isActive: true })
            .select('_id')
            .lean();
    const notifyCustomer = audience !== 'staff' && String(booking.customerId) !== opts.actorId;
    await Promise.all([
        ...(notifyCustomer
            ? [createNotification({ userId: booking.customerId, businessId: booking.businessId, type, title: copy.customer, message, metadata: customerMeta })]
            : []),
        ...staff
            .filter((u) => String(u._id) !== opts.actorId)
            .map((u) => createNotification({ userId: u._id, businessId: booking.businessId, type, title: copy.staff, message, metadata: staffMeta })),
    ]);
    // The email goes to the customer even when they triggered the event themselves (it is their record of it).
    const emailKind = EMAIL_KIND[type];
    if (emailKind && audience !== 'staff' && opts.email !== false) {
        runInBackground(`email ${type} ${booking.bookingNumber}`, async () => {
            const result = await sendBookingEmail(booking._id, emailKind, { detail: opts.detail, leadLabel: opts.leadLabel });
            if (result.status === 'SKIPPED')
                return;
            await createNotification({
                userId: booking.customerId,
                businessId: booking.businessId,
                type,
                title: result.subject ?? copy.customer,
                message,
                channel: 'EMAIL',
                status: result.status === 'SENT' ? 'SENT' : 'FAILED',
                metadata: base,
            });
        });
    }
}
//# sourceMappingURL=notification.helper.js.map