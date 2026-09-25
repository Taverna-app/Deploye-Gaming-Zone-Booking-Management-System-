import { z } from 'zod';
import { BUSINESS_STATUS, SUBSCRIPTION_STATUS } from '../types/enums.js';
import { isValidTimezone } from '../utils/dateTime.js';
import { passwordSchema } from './auth.validator.js';
import { listQuerySchema, objectId } from './common.validator.js';
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
const slug = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only')
    .min(2)
    .max(60);
const timezone = z.string().refine(isValidTimezone, 'Unknown timezone');
const url = z.string().trim().max(500);
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number');
/** Fields shared by create and update. No defaults here, so a partial update never resets anything. */
const businessBase = z.object({
    name: z.string().trim().min(2).max(120),
    slug: slug,
    description: z.string().trim().max(2000),
    phone: phone,
    whatsapp: z.string().trim().regex(/^[0-9]{7,15}$/, 'Digits only, with country code, no +'),
    email: z.string().trim().toLowerCase().email(),
    address: z.string().trim().max(300),
    city: z.string().trim().max(80),
    country: z.string().trim().max(80),
    timezone: timezone,
    currency: z.string().trim().length(3).toUpperCase(),
    openingTime: hhmm,
    closingTime: hhmm,
    logo: url,
    coverImage: url,
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUS),
});
export const createBusinessSchema = businessBase
    .partial()
    .required({ name: true })
    .extend({
    timezone: timezone.default('Asia/Karachi'),
    currency: z.string().trim().length(3).toUpperCase().default('PKR'),
    openingTime: hhmm.default('10:00'),
    closingTime: hhmm.default('02:00'),
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUS).default('TRIAL'),
    bookingPrefix: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2,5}$/, '2-5 letters')
        .optional(),
    ownerName: z.string().trim().min(2).max(120),
    ownerEmail: z.string().trim().toLowerCase().email().max(254),
    ownerPhone: phone.optional(),
    /** Omit to email the owner a set-your-password invitation instead. */
    temporaryPassword: passwordSchema.optional(),
    createDefaultCategories: z.boolean().default(true),
});
// The booking prefix is fixed at creation (it is embedded in every booking number already issued).
export const updateBusinessSchema = businessBase
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const listBusinessesQuerySchema = listQuerySchema.extend({
    status: z.enum(BUSINESS_STATUS).optional(),
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUS).optional(),
    city: z.string().trim().max(80).optional(),
});
export const impersonateSchema = z.object({
    adminId: objectId.optional(),
    reason: z.string().trim().max(300).optional(),
});
//# sourceMappingURL=business.validator.js.map