import { Router } from 'express';
import * as controller from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { uploadLimiter } from '../middleware/rateLimit.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { submitProofSchema, verifyOnlineSchema } from '../validators/payment.validator.js';
/** /api/payments - what a customer does with their own payments, plus the (authorized) proof download. */
export const paymentRouter = Router();
paymentRouter.use(authenticate);
const params = validate(idParamSchema, 'params');
// Any role may ask for a proof; the service only releases it to the owner, the store's staff or a super admin.
paymentRouter.get('/:id/proof', params, controller.getProof);
// The same authorization, answered with a link that works for a minute and shows the file straight from file storage (or null).
paymentRouter.get('/:id/proof-link', params, controller.getProofLink);
paymentRouter.post('/:id/proof', authorize('CUSTOMER'), uploadLimiter, params, uploadSingle('proof'), validate(submitProofSchema), controller.submitProof);
paymentRouter.post('/:id/online/start', authorize('CUSTOMER'), params, controller.startOnline);
paymentRouter.post('/:id/online/verify', authorize('CUSTOMER'), params, validate(verifyOnlineSchema), controller.verifyOnline);
//# sourceMappingURL=payment.routes.js.map