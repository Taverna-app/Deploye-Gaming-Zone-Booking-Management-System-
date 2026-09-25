import { z } from 'zod';
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
/** Optional text fields can be cleared by sending an empty string. */
const text = (max) => z.string().trim().max(max);
const optional = (schema) => schema.or(z.literal(''));
const profile = z
    .object({
    name: z.string().trim().min(2).max(120),
    description: text(2000),
    phone: optional(z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number')),
    whatsapp: optional(z.string().trim().regex(/^[0-9]{7,15}$/, 'Digits only, with country code, no +')),
    email: optional(z.string().trim().toLowerCase().email()),
    address: text(300),
    city: text(80),
    country: text(80),
    openingTime: hhmm,
    closingTime: hhmm,
})
    .partial();
const booking = z
    .object({
    minimumBookingMinutes: z.number().int().min(5).max(24 * 60),
    maximumBookingMinutes: z.number().int().min(5).max(24 * 60),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    advanceBookingDays: z.number().int().min(0).max(365),
    cancellationMinutes: z.number().int().min(0).max(30 * 24 * 60),
    allowCancellation: z.boolean(),
    allowRescheduling: z.boolean(),
    allowWalkIn: z.boolean(),
    allowPayAtVenue: z.boolean(),
    allowBankTransfer: z.boolean(),
    enableEmailNotifications: z.boolean(),
    enableWhatsAppNotifications: z.boolean(),
    paymentHoldMinutes: z.number().int().min(0).max(30 * 24 * 60),
    /** 0 switches the automatic no-show off; otherwise 5 minutes to a day. */
    noShowGraceMinutes: z.number().int().refine((n) => n === 0 || (n >= 5 && n <= 24 * 60), 'Use 0 (off) or 5 to 1440 minutes'),
    taxPercent: z.number().min(0).max(100),
    terms: text(5000),
    cancellationPolicy: text(2000),
})
    .partial();
const bankDetails = z
    .object({
    bankName: text(100),
    accountTitle: text(120),
    accountNumber: text(60),
    iban: text(60),
    instructions: text(500),
})
    .partial();
export const updateSettingsBodySchema = z
    .object({ profile, booking, bankDetails })
    .partial()
    .refine((v) => [v.profile, v.booking, v.bankDetails].some((g) => g && Object.values(g).some((x) => x !== undefined)), 'Nothing to update');
//# sourceMappingURL=settings.validator.js.map