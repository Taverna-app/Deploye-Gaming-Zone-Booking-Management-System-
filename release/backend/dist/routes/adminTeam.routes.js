import { Router } from 'express';
import * as controller from '../controllers/adminTeam.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { inviteStaffSchema, updateStaffSchema } from '../validators/staff.validator.js';
import { createPromoSchema, listPromosQuerySchema, updatePromoSchema } from '../validators/promo.validator.js';
import { authorize } from '../middleware/role.middleware.js';
import { inviteLimiter } from '../middleware/rateLimit.middleware.js';
const params = validate(idParamSchema, 'params');
/** /api/admin/staff. Mounted under the tenant-scoped admin router. Managing people is for store admins only. */
export const staffRouter = Router();
staffRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
staffRouter.get('/', controller.listTeam);
staffRouter.post('/', inviteLimiter, validate(inviteStaffSchema), controller.inviteStaff);
staffRouter.put('/:id', params, validate(updateStaffSchema), controller.updateStaff);
staffRouter.post('/:id/resend-invite', inviteLimiter, params, controller.resendInvite);
/** /api/admin/promos. Discounts are money decisions, so store admins only. */
export const promoRouter = Router();
promoRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
promoRouter.get('/', validate(listPromosQuerySchema, 'query'), controller.listPromos);
promoRouter.post('/', validate(createPromoSchema), controller.createPromo);
promoRouter.put('/:id', params, validate(updatePromoSchema), controller.updatePromo);
promoRouter.delete('/:id', params, controller.deletePromo);
//# sourceMappingURL=adminTeam.routes.js.map