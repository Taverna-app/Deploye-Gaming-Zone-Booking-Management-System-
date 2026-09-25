import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as reviews from '../services/review.service.js';
export const create = asyncHandler(async (req, res) => {
    created(res, await reviews.createReview(req.user.id, req.body), 'Thanks for your review');
});
export const update = asyncHandler(async (req, res) => {
    ok(res, await reviews.updateReview(req.user.id, req.params.id, req.body), 'Review updated');
});
export const listPublic = asyncHandler(async (req, res) => {
    ok(res, await reviews.listPublicReviews(req.params.slug, req.validatedQuery));
});
export const listAdmin = asyncHandler(async (req, res) => {
    const { data, pagination } = await reviews.listAdminReviews(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const moderate = asyncHandler(async (req, res) => {
    ok(res, await reviews.moderateReview(getTenantId(req), req.params.id, req.body.status, req), 'Review updated');
});
//# sourceMappingURL=review.controller.js.map