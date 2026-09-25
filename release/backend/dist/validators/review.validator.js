import { z } from 'zod';
import { listQuerySchema, objectId } from './common.validator.js';
const rating = z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars');
const comment = z.string().trim().max(1500);
export const createReviewSchema = z.object({
    bookingId: objectId,
    rating,
    comment: comment.optional(),
});
export const updateReviewSchema = z
    .object({ rating, comment })
    .partial()
    .refine((v) => v.rating !== undefined || v.comment !== undefined, 'Nothing to update');
export const listPublicReviewsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const listAdminReviewsQuerySchema = listQuerySchema.extend({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
});
/** A store hides a review it considers abusive, or restores one it hid. */
export const moderateReviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
//# sourceMappingURL=review.validator.js.map