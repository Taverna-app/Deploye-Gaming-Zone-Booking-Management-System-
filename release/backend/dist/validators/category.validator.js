import { z } from 'zod';
import { listQuerySchema } from './common.validator.js';
const fields = {
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500),
    image: z.string().trim().max(500),
    icon: z.string().trim().max(40),
    active: z.boolean(),
    priceOnRequest: z.boolean(),
    displayOrder: z.number().int().min(0).max(10_000),
};
export const createCategorySchema = z.object({
    name: fields.name,
    description: fields.description.optional(),
    image: fields.image.optional(),
    icon: fields.icon.optional(),
    active: fields.active.default(true),
    priceOnRequest: fields.priceOnRequest.default(false),
    displayOrder: fields.displayOrder.optional(),
});
export const updateCategorySchema = z
    .object(fields)
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const listCategoriesQuerySchema = listQuerySchema.extend({
    active: z.enum(['true', 'false']).optional(),
});
//# sourceMappingURL=category.validator.js.map