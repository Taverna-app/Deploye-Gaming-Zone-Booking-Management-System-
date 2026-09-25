import { Schema, model } from 'mongoose';
import { PRICING_RULE_TYPE } from '../types/enums.js';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const pricingRuleSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'GamingCategory', required: true },
    /** Optional: a station-specific rule overrides category rules. */
    stationId: { type: Schema.Types.ObjectId, ref: 'Station' },
    name: { type: String, required: true, trim: true },
    ruleType: { type: String, enum: PRICING_RULE_TYPE, default: 'NORMAL' },
    startTime: { type: String, match: HHMM },
    endTime: { type: String, match: HHMM },
    /** 0 = Sunday ... 6 = Saturday */
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    pricePerHour: { type: Number, min: 0 },
    fixedPrice: { type: Number, min: 0 },
    multiplier: { type: Number, min: 0 },
    /** "YYYY-MM-DD" in business timezone (SPECIAL_DATE range). */
    startDate: String,
    endDate: String,
    /** Higher wins when several rules match the same minute. */
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
}, { timestamps: true });
pricingRuleSchema.index({ businessId: 1, categoryId: 1, active: 1 });
pricingRuleSchema.index({ businessId: 1, stationId: 1 });
export const PricingRule = model('PricingRule', pricingRuleSchema);
//# sourceMappingURL=PricingRule.js.map