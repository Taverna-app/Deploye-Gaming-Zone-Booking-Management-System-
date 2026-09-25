import { z } from 'zod';
import { PRICING_RULE_TYPE } from '../types/enums.js';
import { ValidationError } from '../utils/errors.js';
import { listQuerySchema, localDateString, objectId } from './common.validator.js';
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
const date = localDateString;
const money = z.number().min(0).max(10_000_000);
const fields = {
    categoryId: objectId,
    stationId: objectId,
    name: z.string().trim().min(2).max(100),
    ruleType: z.enum(PRICING_RULE_TYPE),
    startTime: hhmm,
    endTime: hhmm,
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
    pricePerHour: money,
    fixedPrice: money,
    multiplier: z.number().gt(0).max(20),
    startDate: date,
    endDate: date,
    priority: z.number().int().min(-1000).max(1000),
    active: z.boolean(),
};
/**
 * Cross-field rules. Also run by the service on the merged document after a partial update, so an
 * update can never leave a rule in an invalid combination.
 */
export function assertRuleShape(r) {
    const problems = [];
    const priceKinds = [r.pricePerHour, r.fixedPrice, r.multiplier].filter((v) => v != null).length;
    if (priceKinds !== 1) {
        problems.push({ path: 'pricePerHour', message: 'Set exactly one of pricePerHour, fixedPrice or multiplier' });
    }
    if ((r.startTime == null) !== (r.endTime == null)) {
        problems.push({ path: 'startTime', message: 'startTime and endTime must be set together' });
    }
    if (r.ruleType === 'PEAK' && (r.startTime == null || r.endTime == null)) {
        problems.push({ path: 'startTime', message: 'PEAK rules need startTime and endTime' });
    }
    if (r.ruleType === 'WEEKEND' && !r.daysOfWeek?.length) {
        problems.push({ path: 'daysOfWeek', message: 'WEEKEND rules need daysOfWeek (0 = Sunday ... 6 = Saturday)' });
    }
    if (r.ruleType === 'SPECIAL_DATE') {
        if (!r.startDate || !r.endDate)
            problems.push({ path: 'startDate', message: 'SPECIAL_DATE rules need startDate and endDate' });
        else if (r.endDate < r.startDate)
            problems.push({ path: 'endDate', message: 'endDate must not be before startDate' });
    }
    if (problems.length)
        throw new ValidationError('Invalid pricing rule', problems);
}
export const createPricingRuleSchema = z
    .object({
    categoryId: fields.categoryId,
    stationId: fields.stationId.optional(),
    name: fields.name,
    ruleType: fields.ruleType.default('NORMAL'),
    startTime: fields.startTime.optional(),
    endTime: fields.endTime.optional(),
    daysOfWeek: fields.daysOfWeek.optional(),
    pricePerHour: fields.pricePerHour.optional(),
    fixedPrice: fields.fixedPrice.optional(),
    multiplier: fields.multiplier.optional(),
    startDate: fields.startDate.optional(),
    endDate: fields.endDate.optional(),
    priority: fields.priority.default(0),
    active: fields.active.default(true),
})
    .superRefine((v, ctx) => {
    try {
        assertRuleShape(v);
    }
    catch (e) {
        for (const p of e.errors) {
            ctx.addIssue({ code: 'custom', path: [p.path], message: p.message });
        }
    }
});
// The category is fixed once created; move a rule by recreating it.
export const updatePricingRuleSchema = z
    .object({ ...fields, categoryId: z.never().optional() })
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const listPricingRulesQuerySchema = listQuerySchema.extend({
    categoryId: objectId.optional(),
    stationId: objectId.optional(),
    ruleType: z.enum(PRICING_RULE_TYPE).optional(),
    active: z.enum(['true', 'false']).optional(),
});
export const pricePreviewSchema = z.object({
    stationId: objectId,
    /** Local booking date in the business timezone. */
    date,
    startTime: hhmm,
    durationMinutes: z.number().int().min(5).max(24 * 60),
    promoCode: z.string().trim().max(40).optional(),
});
//# sourceMappingURL=pricing.validator.js.map