import { Router } from 'express';
import * as controller from '../controllers/review.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { listAdminReviewsQuerySchema, moderateReviewSchema } from '../validators/review.validator.js';
/** /api/admin/reviews. Store admins read and moderate the reviews of their own store. */
export const reviewAdminRouter = Router();
reviewAdminRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
reviewAdminRouter.get('/', validate(listAdminReviewsQuerySchema, 'query'), controller.listAdmin);
reviewAdminRouter.put('/:id', validate(idParamSchema, 'params'), validate(moderateReviewSchema), controller.moderate);
//# sourceMappingURL=adminReview.routes.js.map