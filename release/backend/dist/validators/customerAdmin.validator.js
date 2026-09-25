import { z } from 'zod';
import { listQuerySchema } from './common.validator.js';
export const CUSTOMER_SORT_FIELDS = ['name', 'bookings', 'completed', 'cancelled', 'spent', 'lastVisit'];
export const listStoreCustomersQuerySchema = listQuerySchema.extend({
    sortBy: z.enum(CUSTOMER_SORT_FIELDS).optional(),
    /** Only customers created at the desk (walk-ins), or only those who signed up themselves. */
    walkIn: z.enum(['true', 'false']).optional(),
});
export const customerNoteSchema = z.object({
    /** An empty note removes it. */
    notes: z.string().trim().max(2000),
});
//# sourceMappingURL=customerAdmin.validator.js.map