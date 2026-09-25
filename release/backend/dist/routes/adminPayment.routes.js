import { Router } from 'express';
import * as controller from '../controllers/payment.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { listAdminPaymentsQuerySchema, refundPaymentSchema, rejectPaymentSchema } from '../validators/payment.validator.js';
/** /api/admin/payments (tenant-scoped by the parent router). Money decisions are for store admins, not desk staff. */
export const adminPaymentRouter = Router();
adminPaymentRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
const params = validate(idParamSchema, 'params');
adminPaymentRouter.get('/', validate(listAdminPaymentsQuerySchema, 'query'), controller.list);
adminPaymentRouter.get('/:id', params, controller.get);
adminPaymentRouter.post('/:id/approve', params, controller.approve);
adminPaymentRouter.post('/:id/reject', params, validate(rejectPaymentSchema), controller.reject);
adminPaymentRouter.post('/:id/refund', params, validate(refundPaymentSchema), controller.refund);
//# sourceMappingURL=adminPayment.routes.js.map