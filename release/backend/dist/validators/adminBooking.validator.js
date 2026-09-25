import { z } from 'zod';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../types/enums.js';
import { listQuerySchema, localDateString, objectId } from './common.validator.js';
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');
const phone = z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/, 'Invalid phone number');
/** Either an existing customer, or the details needed to find-or-create one at the desk. */
const walkInCustomer = z
    .object({
    customerId: objectId.optional(),
    name: z.string().trim().min(2).max(120).optional(),
    phone: phone.optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
})
    .refine((c) => c.customerId || (c.name && (c.phone || c.email)), {
    message: 'Provide an existing customerId, or a name plus a phone or email',
    path: ['name'],
});
export const walkInSchema = z.object({
    customer: walkInCustomer,
    stationId: objectId,
    /** Business day the session belongs to (defaults to "now" on the client). */
    date: localDateString,
    startTime: hhmm,
    durationMinutes: z.number().int().min(5).max(24 * 60),
    numberOfPlayers: z.number().int().min(1).max(100).default(1),
    /** Online payment needs the customer's own device, so it is not offered at the desk. */
    paymentMethod: z.enum(['PAY_AT_VENUE', 'BANK_TRANSFER']).default('PAY_AT_VENUE'),
    promoCode: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
    /** Cash taken at the desk right now (pay-at-venue only). */
    paidNow: z.boolean().default(false),
});
export const listAdminBookingsQuerySchema = listQuerySchema.extend({
    bookingStatus: z.enum(BOOKING_STATUS).optional(),
    paymentStatus: z.enum(PAYMENT_STATUS).optional(),
    stationId: objectId.optional(),
    categoryId: objectId.optional(),
    customerId: objectId.optional(),
    source: z.enum(['ONLINE', 'WALK_IN']).optional(),
    /** One business day. */
    date: localDateString.optional(),
});
export const updateAdminBookingSchema = z
    .object({
    adminNotes: z.string().trim().max(1000),
    numberOfPlayers: z.number().int().min(1).max(100),
})
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export const checkOutSchema = z.object({
    /** Bill the time used beyond the booked end (default on). */
    chargeOvertime: z.boolean().default(true),
    /** Take the cash owed right now (pay-at-venue only). */
    collectPayment: z.boolean().default(false),
});
export const extendSchema = z.object({
    extraMinutes: z.number().int().min(5).max(8 * 60),
    collectPayment: z.boolean().default(false),
});
export const noShowSchema = z.object({
    reason: z.string().trim().max(300).optional(),
});
export const calendarQuerySchema = z.object({
    view: z.enum(['day', 'week', 'month']).default('day'),
    date: localDateString,
    categoryId: objectId.optional(),
    includeCancelled: z.enum(['true', 'false']).default('false'),
});
//# sourceMappingURL=adminBooking.validator.js.map