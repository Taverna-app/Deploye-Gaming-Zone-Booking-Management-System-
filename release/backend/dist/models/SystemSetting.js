import { Schema, model } from 'mongoose';
/** Single-document platform configuration (key = "platform"). */
const systemSettingSchema = new Schema({
    key: { type: String, required: true, default: 'platform' },
    platformName: { type: String, default: 'Zobix Solutions' },
    logo: String,
    defaultCurrency: { type: String, default: 'PKR' },
    defaultTimezone: { type: String, default: 'Asia/Karachi' },
    emailSettings: {
        fromName: { type: String, default: 'Zobix Solutions' },
        enabled: { type: Boolean, default: true },
    },
    notificationDefaults: {
        email: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
    },
    bookingDefaults: {
        minimumBookingMinutes: { type: Number, default: 60 },
        maximumBookingMinutes: { type: Number, default: 480 },
        advanceBookingDays: { type: Number, default: 30 },
        cancellationMinutes: { type: Number, default: 120 },
    },
}, { timestamps: true });
systemSettingSchema.index({ key: 1 }, { unique: true });
export const SystemSetting = model('SystemSetting', systemSettingSchema);
//# sourceMappingURL=SystemSetting.js.map