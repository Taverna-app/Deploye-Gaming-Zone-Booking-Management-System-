import { Schema, model } from 'mongoose';
const businessSettingsSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    minimumBookingMinutes: { type: Number, default: 60, min: 15 },
    maximumBookingMinutes: { type: Number, default: 480 },
    /** Length of one bookable slot / start-time granularity. */
    slotIntervalMinutes: { type: Number, default: 30, min: 5 },
    advanceBookingDays: { type: Number, default: 30, min: 0 },
    cancellationMinutes: { type: Number, default: 120, min: 0 },
    allowCancellation: { type: Boolean, default: true },
    allowRescheduling: { type: Boolean, default: true },
    allowWalkIn: { type: Boolean, default: true },
    requireAdvancePayment: { type: Boolean, default: false },
    allowPayAtVenue: { type: Boolean, default: true },
    allowBankTransfer: { type: Boolean, default: true },
    enableEmailNotifications: { type: Boolean, default: true },
    enableWhatsAppNotifications: { type: Boolean, default: true },
    enableCustomerRegistration: { type: Boolean, default: true },
    /** Unpaid bank-transfer / online bookings are released after this many minutes (0 = hold forever). */
    paymentHoldMinutes: { type: Number, default: 120, min: 0 },
    /** Minutes after the start time when a booking nobody checked in is marked a no-show by itself (0 = never). */
    noShowGraceMinutes: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    terms: String,
    cancellationPolicy: String,
}, { timestamps: true });
businessSettingsSchema.index({ businessId: 1 }, { unique: true });
export const BusinessSettings = model('BusinessSettings', businessSettingsSchema);
//# sourceMappingURL=BusinessSettings.js.map