import { z } from 'zod';
import { ROLES } from '../types/enums.js';
import { listQuerySchema, objectId } from './common.validator.js';
export const dashboardQuerySchema = z.object({
    businessId: objectId.optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
});
export const listUsersQuerySchema = listQuerySchema.extend({
    role: z.enum(ROLES).optional(),
    businessId: objectId.optional(),
    isActive: z.enum(['true', 'false']).optional(),
});
export const listAuditLogsQuerySchema = listQuerySchema.extend({
    businessId: objectId.optional(),
    userId: objectId.optional(),
    action: z.string().trim().max(60).optional(),
    entity: z.string().trim().max(60).optional(),
});
export const updateSettingsSchema = z
    .object({
    platformName: z.string().trim().min(1).max(80),
    logo: z.string().trim().max(500),
    defaultCurrency: z.string().trim().length(3).toUpperCase(),
    defaultTimezone: z.string().trim().max(60),
    emailSettings: z.object({ fromName: z.string().trim().max(80), enabled: z.boolean() }).partial(),
    notificationDefaults: z.object({ email: z.boolean(), whatsapp: z.boolean(), inApp: z.boolean() }).partial(),
    bookingDefaults: z
        .object({
        minimumBookingMinutes: z.number().int().min(15),
        maximumBookingMinutes: z.number().int().min(15),
        advanceBookingDays: z.number().int().min(0),
        cancellationMinutes: z.number().int().min(0),
    })
        .partial(),
})
    .partial();
//# sourceMappingURL=superAdmin.validator.js.map