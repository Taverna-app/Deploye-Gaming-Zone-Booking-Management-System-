import { z } from 'zod';
import { DISCOUNT_TYPE } from '../types/enums.js';
import { listQuerySchema, localDateString } from './common.validator.js';
const money = z.number().min(0).max(10_000_000);
const fields = {
    discountType: z.enum(DISCOUNT_TYPE),
    value: z.number().gt(0).max(10_000_000),
    minimumAmount: money,
    maximumDiscount: money.nullable(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable(),
    /** Local dates in the store's timezone. The code works from the start of `startsOn` to the end of `endsOn`. */
    startsOn: localDateString.nullable(),
    endsOn: localDateString.nullable(),
    active: z.boolean(),
};
export const createPromoSchema = z.object({
    code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9_-]{2,19}$/, 'Use 3-20 letters, numbers, hyphens or underscores'),
    discountType: fields.discountType,
    value: fields.value,
    minimumAmount: fields.minimumAmount.default(0),
    maximumDiscount: fields.maximumDiscount.optional(),
    usageLimit: fields.usageLimit.optional(),
    startsOn: fields.startsOn.optional(),
    endsOn: fields.endsOn.optional(),
    active: fields.active.default(true),
});
/** The code itself and its use count never change. */
export const updatePromoSchema = z
    .object(fields)
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const listPromosQuerySchema = listQuerySchema.extend({
    active: z.enum(['true', 'false']).optional(),
});
//# sourceMappingURL=promo.validator.js.map