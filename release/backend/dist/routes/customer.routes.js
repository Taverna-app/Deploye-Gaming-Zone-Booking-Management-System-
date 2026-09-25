import { Router } from 'express';
import * as controller from '../controllers/customer.controller.js';
import * as paymentController from '../controllers/payment.controller.js';
import { validate as validateSlug } from '../middleware/validation.middleware.js';
import { slugParamSchema } from '../validators/public.validator.js';
import * as reviewController from '../controllers/review.controller.js';
import { createReviewSchema, updateReviewSchema } from '../validators/review.validator.js';
import { idParamSchema } from '../validators/common.validator.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { listCustomerBookingsQuerySchema, listCustomerPaymentsQuerySchema, updateProfileSchema, } from '../validators/customer.validator.js';
/** The logged-in customer's own data. Everything is scoped by the authenticated user id, never by a param. */
export const customerRouter = Router();
customerRouter.use(authenticate, authorize('CUSTOMER'));
customerRouter.get('/bookings', validate(listCustomerBookingsQuerySchema, 'query'), controller.listBookings);
customerRouter.get('/payments', validate(listCustomerPaymentsQuerySchema, 'query'), controller.listPayments);
customerRouter.get('/profile', controller.getProfile);
customerRouter.put('/profile', validate(updateProfileSchema), controller.updateProfile);
// Reviews of completed bookings (one per booking).
customerRouter.post('/reviews', validate(createReviewSchema), reviewController.create);
customerRouter.put('/reviews/:id', validate(idParamSchema, 'params'), validate(updateReviewSchema), reviewController.update);
// Bank details for paying by transfer: signed-in customers only (never on the public store page).
customerRouter.get('/stores/:slug/payment-info', validateSlug(slugParamSchema, 'params'), paymentController.paymentInfo);
//# sourceMappingURL=customer.routes.js.map