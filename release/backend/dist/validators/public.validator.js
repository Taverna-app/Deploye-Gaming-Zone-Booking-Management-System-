import { z } from 'zod';
import { listQuerySchema, localDateString, objectId } from './common.validator.js';
export const slugParamSchema = z.object({ slug: z.string().trim().toLowerCase().min(2).max(60) });
export const listPublicBusinessesQuerySchema = listQuerySchema.extend({
    city: z.string().trim().max(80).optional(),
    /** Gaming type, matched against category names: "PC", "PS5", "Private Room", "Racing", "Pool". */
    type: z.string().trim().max(40).optional(),
});
export const publicStationsQuerySchema = z.object({ categoryId: objectId.optional() });
export const availabilityQuerySchema = z
    .object({
    date: localDateString,
    durationMinutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
    stationId: objectId.optional(),
    categoryId: objectId.optional(),
    /** With startTime: "which stations are free for exactly this window?" */
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)').optional(),
})
    .refine((q) => q.stationId || q.categoryId || q.startTime, 'Provide stationId, categoryId or startTime');
/** "How much would this booking cost?" - the same inputs as a booking, minus the customer details. */
export const quoteSchema = z.object({
    stationId: objectId,
    date: localDateString,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)'),
    durationMinutes: z.number().int().min(5).max(24 * 60),
    promoCode: z.string().trim().max(40).optional(),
});
//# sourceMappingURL=public.validator.js.map