import { Schema, model } from 'mongoose';
import { DISCOUNT_TYPE } from '../types/enums.js';
const promoCodeSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    discountType: { type: String, enum: DISCOUNT_TYPE, required: true },
    value: { type: Number, required: true, min: 0 },
    minimumAmount: { type: Number, default: 0, min: 0 },
    maximumDiscount: { type: Number, min: 0 },
    usageLimit: { type: Number, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    startDate: Date,
    endDate: Date,
    active: { type: Boolean, default: true },
}, { timestamps: true });
promoCodeSchema.index({ businessId: 1, code: 1 }, { unique: true });
export const PromoCode = model('PromoCode', promoCodeSchema);
//# sourceMappingURL=PromoCode.js.map