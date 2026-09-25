import { z } from 'zod';
import { MAX_LIMIT } from '../utils/pagination.js';
import { isValidLocalDate } from '../utils/dateTime.js';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
/** A real calendar date, "YYYY-MM-DD" (rejects e.g. 2026-13-45 and 2026-02-30). */
export const localDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine(isValidLocalDate, 'Not a valid date');
export const idParamSchema = z.object({ id: objectId });
/** Shared list query: pagination + search + sorting + date range. Extend per endpoint. */
export const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
    search: z.string().trim().max(100).optional(),
    sortBy: z.string().trim().max(40).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
});
//# sourceMappingURL=common.validator.js.map