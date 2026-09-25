import { Router } from 'express';
import * as controller from '../controllers/customerAdmin.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { customerNoteSchema, listStoreCustomersQuerySchema } from '../validators/customerAdmin.validator.js';
/** /api/admin/customers. A store's own customers, with what they spent: store admins only. */
export const customerAdminRouter = Router();
customerAdminRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
customerAdminRouter.get('/', validate(listStoreCustomersQuerySchema, 'query'), controller.list);
customerAdminRouter.get('/:id', validate(idParamSchema, 'params'), controller.get);
customerAdminRouter.put('/:id/notes', validate(idParamSchema, 'params'), validate(customerNoteSchema), controller.setNote);
//# sourceMappingURL=adminCustomer.routes.js.map