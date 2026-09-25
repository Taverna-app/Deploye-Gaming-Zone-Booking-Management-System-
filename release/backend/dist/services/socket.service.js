import { Booking, Payment, Station } from '../models/index.js';
import { getIO, rooms } from '../config/socket.js';
import { runInBackground } from '../utils/background.js';
/** Events after which a slot's free/busy state may have changed. */
const CHANGES_AVAILABILITY = new Set(['booking:created', 'booking:updated', 'booking:cancelled', 'booking:rescheduled']);
function dashboard(businessId, reason) {
    getIO()?.to([rooms.business(businessId), rooms.platform]).emit('dashboard:updated', { businessId, reason, at: new Date().toISOString() });
}
export function publishBooking(event, bookingId, opts = {}) {
    runInBackground(`realtime ${event}`, async () => {
        const io = getIO();
        if (!io)
            return;
        const b = await Booking.findById(bookingId)
            .select('bookingNumber businessId customerId stationId categoryId bookingDate startTime endTime startDateTime endDateTime durationMinutes bookingStatus paymentStatus paymentMethod totalAmount source')
            .populate('stationId', 'code status')
            .populate('customerId', 'name phone')
            .lean();
        if (!b)
            return;
        const businessId = String(b.businessId);
        const station = b.stationId;
        const customer = b.customerId;
        const stationId = String(station._id);
        io.to(rooms.business(businessId)).emit(event, {
            booking: {
                _id: String(b._id),
                bookingNumber: b.bookingNumber,
                businessId,
                stationId,
                stationCode: station.code,
                categoryId: String(b.categoryId),
                bookingDate: b.bookingDate,
                startTime: b.startTime,
                endTime: b.endTime,
                startDateTime: b.startDateTime,
                endDateTime: b.endDateTime,
                durationMinutes: b.durationMinutes,
                bookingStatus: b.bookingStatus,
                paymentStatus: b.paymentStatus,
                paymentMethod: b.paymentMethod,
                totalAmount: b.totalAmount,
                source: b.source,
                customer: { _id: String(customer._id), name: customer.name, phone: customer.phone },
            },
        });
        // The customer hears only about their own booking, and only its status.
        io.to(rooms.user(String(customer._id))).emit('customer:booking-updated', {
            event,
            booking: { _id: String(b._id), bookingNumber: b.bookingNumber, bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus, bookingDate: b.bookingDate, startTime: b.startTime, endTime: b.endTime },
        });
        if (CHANGES_AVAILABILITY.has(event)) {
            const slots = [{ stationId, date: b.bookingDate }, ...(opts.previous ? [opts.previous] : [])];
            for (const s of slots)
                io.to(rooms.availability(s.stationId)).emit('availability:changed', { stationId: s.stationId, businessId, date: s.date, reason: event });
        }
        if (opts.stationStatus) {
            io.to(rooms.business(businessId)).emit('station:status-changed', { stationId, code: station.code, status: station.status });
        }
        dashboard(businessId, event);
    });
}
/** Payment activity goes to the store's admins only (desk staff do not manage money) and to the paying customer. */
export function publishPayment(event, paymentId) {
    runInBackground(`realtime ${event}`, async () => {
        const io = getIO();
        if (!io)
            return;
        const p = await Payment.findById(paymentId).select('bookingId businessId customerId status method amount proofUploadedAt').lean();
        if (!p)
            return;
        const booking = await Booking.findById(p.bookingId).select('bookingNumber bookingStatus paymentStatus bookingDate startTime endTime').lean();
        const businessId = String(p.businessId);
        io.to(rooms.admins(businessId)).emit(event, {
            payment: { _id: String(p._id), bookingId: String(p.bookingId), bookingNumber: booking?.bookingNumber, status: p.status, method: p.method, amount: p.amount, hasProof: Boolean(p.proofUploadedAt) },
        });
        if (booking) {
            io.to(rooms.user(String(p.customerId))).emit('customer:booking-updated', {
                event,
                booking: { _id: String(p.bookingId), bookingNumber: booking.bookingNumber, bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus, bookingDate: booking.bookingDate, startTime: booking.startTime, endTime: booking.endTime },
            });
        }
        dashboard(businessId, event);
    });
}
export function publishStation(event, stationId) {
    runInBackground(`realtime ${event}`, async () => {
        const io = getIO();
        if (!io)
            return;
        const s = await Station.findById(stationId).select('businessId code status active').lean();
        if (!s)
            return;
        const businessId = String(s.businessId);
        io.to(rooms.business(businessId)).emit(event, { stationId: String(s._id), code: s.code, status: s.status, active: s.active });
        io.to(rooms.availability(String(s._id))).emit('availability:changed', { stationId: String(s._id), businessId, reason: event });
        dashboard(businessId, event);
    });
}
/** Pushes a freshly created in-app notification to its owner's sockets (every open tab). */
export function publishNotification(n) {
    const io = getIO();
    if (!io)
        return;
    io.to(rooms.user(String(n.userId))).emit('notification:new', {
        notification: { _id: String(n._id), type: n.type, title: n.title, message: n.message, createdAt: n.createdAt, metadata: n.metadata },
    });
}
//# sourceMappingURL=socket.service.js.map