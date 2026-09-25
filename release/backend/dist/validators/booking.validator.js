import { z } from 'zod';
import { PAYMENT_METHOD } from '../types/enums.js';
import { localDateString, objectId } from './common.validator.js';
const date = localDateString;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
const duration = z.number().int().min(5).max(24 * 60);
export const createBookingSchema = z.object({
    businessSlug: z.string().trim().toLowerCase().min(2).max(60),
    stationId: objectId,
    /** Business day (in the store's timezone). */
    date,
    startTime: hhmm,
    durationMinutes: duration,
    numberOfPlayers: z.number().int().min(1).max(100).default(1),
    paymentMethod: z.enum(PAYMENT_METHOD),
    promoCode: z.string().trim().max(40).optional(),
    customerNotes: z.string().trim().max(500).optional(),
});
export const cancelBookingSchema = z.object({
    reason: z.string().trim().max(300).optional(),
});
export const rescheduleBookingSchema = z.object({
    date,
    startTime: hhmm,
    durationMinutes: duration.optional(),
    stationId: objectId.optional(),
});
export const bookingNumberParamSchema = z.object({
    bookingNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}-\d{8}-\d{4,}$/, 'Invalid booking number'),
});
//# sourceMappingURL=booking.validator.js.map