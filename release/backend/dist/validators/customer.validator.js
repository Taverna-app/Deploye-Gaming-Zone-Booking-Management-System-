import { z } from 'zod';
import { PAYMENT_STATUS } from '../types/enums.js';
import { listQuerySchema } from './common.validator.js';
export const listCustomerBookingsQuerySchema = listQuerySchema.extend({
    /** upcoming = not finished and not cancelled; past = finished / no-show; cancelled; all. */
    view: z.enum(['upcoming', 'past', 'cancelled', 'all']).default('all'),
});
export const listCustomerPaymentsQuerySchema = listQuerySchema.extend({
    status: z.enum(PAYMENT_STATUS).optional(),
});
export const updateProfileSchema = z
    .object({
    name: z.string().trim().min(2).max(120),
    phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number')
        .or(z.literal('')),
})
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const listNotificationsQuerySchema = listQuerySchema.extend({
    unread: z.enum(['true', 'false']).optional(),
});
//# sourceMappingURL=customer.validator.js.map