import { Schema, model } from 'mongoose';
import { BOOKING_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '../types/enums.js';
const bookingSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    bookingNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'GamingCategory', required: true },
    /** Local calendar date in the business timezone, "YYYY-MM-DD". */
    bookingDate: { type: String, required: true },
    /** Local wall-clock "HH:mm" in the business timezone. */
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    /** Canonical UTC instants used for all overlap checks. */
    startDateTime: { type: Date, required: true },
    endDateTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    numberOfPlayers: { type: Number, default: 1, min: 1 },
    /** Time used beyond the booked end, billed at check-out. */
    overtimeMinutes: { type: Number, default: 0, min: 0 },
    promoCode: String,
    baseAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'PENDING' },
    /**
     * Money actually received for this booking (payments in status PAID). Kept by `recomputeBookingPayment`, the single
     * place payment status is derived, so reports and customer totals can add it up without joining the payments
     * collection for every booking.
     */
    amountPaid: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHOD, required: true },
    bookingStatus: { type: String, enum: BOOKING_STATUS, default: 'PENDING' },
    customerNotes: String,
    adminNotes: String,
    checkedInAt: Date,
    checkedOutAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: String,
    noShowReason: String,
    /** When the current time slot was set (creation, or the latest reschedule). Reminders only apply to lead times that still lay ahead at that moment. */
    scheduledAt: { type: Date, default: Date.now },
    /** Reminder idempotency: a kind appears here at most once per slot; claimed atomically before sending. */
    remindersSent: [new Schema({ kind: String, sentAt: Date, status: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED'], default: 'SENT' } }, { _id: false })],
    source: { type: String, enum: ['ONLINE', 'WALK_IN'], default: 'ONLINE' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
bookingSchema.index({ bookingNumber: 1 }, { unique: true });
bookingSchema.index({ businessId: 1, bookingDate: 1 });
bookingSchema.index({ businessId: 1, stationId: 1, startDateTime: 1 });
bookingSchema.index({ businessId: 1, bookingStatus: 1 });
bookingSchema.index({ businessId: 1, startDateTime: -1 }); // the store's bookings list, newest first
bookingSchema.index({ businessId: 1, customerId: 1 }); // a store's customers and their totals
bookingSchema.index({ customerId: 1, startDateTime: -1 });
bookingSchema.index({ bookingStatus: 1, startDateTime: 1 }); // reminder job
export const Booking = model('Booking', bookingSchema);
//# sourceMappingURL=Booking.js.map