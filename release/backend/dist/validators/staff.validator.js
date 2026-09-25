import { z } from 'zod';
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number');
export const inviteStaffSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: phone.optional(),
});
/** Only these fields can be edited. Role and store are never changed from here. */
export const updateStaffSchema = z
    .object({
    name: z.string().trim().min(2).max(120),
    phone: phone.or(z.literal('')),
    isActive: z.boolean(),
})
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
//# sourceMappingURL=staff.validator.js.map