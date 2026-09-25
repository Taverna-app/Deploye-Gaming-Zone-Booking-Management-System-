import { z } from 'zod';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '../types/enums.js';
import { listQuerySchema, objectId } from './common.validator.js';
/** Multipart text fields arrive as strings; the file itself is handled by the upload middleware. */
export const submitProofSchema = z.object({
    transactionReference: z.string().trim().max(100).optional(),
});
export const verifyOnlineSchema = z.object({
    reference: z.string().trim().min(1).max(200),
    /** Only honoured by the demo provider. */
    outcome: z.enum(['success', 'failure']).optional(),
});
export const rejectPaymentSchema = z.object({
    reason: z.string().trim().min(3, 'Give the customer a short reason').max(300),
});
export const refundPaymentSchema = z.object({
    reason: z.string().trim().max(300).optional(),
});
export const listAdminPaymentsQuerySchema = listQuerySchema.extend({
    status: z.enum(PAYMENT_STATUS).optional(),
    method: z.enum(PAYMENT_METHOD).optional(),
    /** Only on the platform-wide (super admin) list. */
    businessId: objectId.optional(),
    /** Payments waiting for a decision that already have a proof / reference attached. */
    needsReview: z.enum(['true', 'false']).optional(),
});
//# sourceMappingURL=payment.validator.js.map