import { Router } from 'express';
import * as controller from '../controllers/pricing.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createPricingRuleSchema, listPricingRulesQuerySchema, pricePreviewSchema, updatePricingRuleSchema, } from '../validators/pricing.validator.js';
export const pricingRouter = Router();
const manage = authorize('STORE_ADMIN', 'SUPER_ADMIN');
const params = validate(idParamSchema, 'params');
pricingRouter.post('/preview', validate(pricePreviewSchema), controller.preview); // any store role (walk-ins need quotes)
pricingRouter.get('/', manage, validate(listPricingRulesQuerySchema, 'query'), controller.list);
pricingRouter.get('/:id', manage, params, controller.get);
pricingRouter.post('/', manage, validate(createPricingRuleSchema), controller.create);
pricingRouter.put('/:id', manage, params, validate(updatePricingRuleSchema), controller.update);
pricingRouter.delete('/:id', manage, params, controller.remove);
//# sourceMappingURL=pricing.routes.js.map