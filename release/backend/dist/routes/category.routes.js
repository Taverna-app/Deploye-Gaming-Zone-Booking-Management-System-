import { Router } from 'express';
import * as controller from '../controllers/category.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createCategorySchema, listCategoriesQuerySchema, updateCategorySchema } from '../validators/category.validator.js';
export const categoryRouter = Router();
const manage = authorize('STORE_ADMIN', 'SUPER_ADMIN');
const params = validate(idParamSchema, 'params');
categoryRouter.get('/', validate(listCategoriesQuerySchema, 'query'), controller.list);
categoryRouter.get('/:id', params, controller.get);
categoryRouter.post('/', manage, validate(createCategorySchema), controller.create);
categoryRouter.put('/:id', manage, params, validate(updateCategorySchema), controller.update);
categoryRouter.delete('/:id', manage, params, controller.remove);
//# sourceMappingURL=category.routes.js.map