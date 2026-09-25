import { Schema, model } from 'mongoose';
import { BUSINESS_STATUS, SUBSCRIPTION_STATUS } from '../types/enums.js';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const businessSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    /** 2-5 letter code used in booking numbers, e.g. "ZGA". Unique across the platform. */
    bookingPrefix: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z]{2,5}$/ },
    logo: String,
    coverImage: String,
    description: { type: String, maxlength: 2000 },
    phone: String,
    whatsapp: String,
    email: { type: String, lowercase: true, trim: true },
    address: String,
    city: { type: String, trim: true },
    country: { type: String, default: 'Pakistan' },
    timezone: { type: String, default: 'Asia/Karachi' },
    currency: { type: String, default: 'PKR', uppercase: true, minlength: 3, maxlength: 3 },
    /** Local wall-clock times in the business timezone, "HH:mm". closingTime <= openingTime means it runs past midnight. */
    openingTime: { type: String, default: '10:00', match: HHMM },
    closingTime: { type: String, default: '02:00', match: HHMM },
    status: { type: String, enum: BUSINESS_STATUS, default: 'ACTIVE' },
    subscriptionStatus: { type: String, enum: SUBSCRIPTION_STATUS, default: 'TRIAL' },
    branding: {
        primaryColor: { type: String, default: '#7c5cff' },
        accentColor: { type: String, default: '#22e1ff' },
    },
    bankDetails: {
        bankName: String,
        accountTitle: String,
        accountNumber: String,
        iban: String,
        instructions: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
businessSchema.index({ slug: 1 }, { unique: true });
businessSchema.index({ bookingPrefix: 1 }, { unique: true });
businessSchema.index({ status: 1, city: 1 });
businessSchema.index({ name: 'text', city: 'text' });
export const Business = model('Business', businessSchema);
//# sourceMappingURL=Business.js.map