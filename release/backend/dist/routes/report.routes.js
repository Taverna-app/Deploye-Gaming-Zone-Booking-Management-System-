import { Router } from 'express';
import * as controller from '../controllers/report.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { exportLimiter, reportLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { exportParamsSchema, reportQuerySchema } from '../validators/report.validator.js';
/** /api/admin/reports. Tenant-scoped by the parent router; figures about money and customers are for store admins. */
export const reportRouter = Router();
reportRouter.use(authorize('STORE_ADMIN', 'SUPER_ADMIN'));
reportRouter.get('/', reportLimiter, validate(reportQuerySchema, 'query'), controller.report);
reportRouter.get('/export/:kind', exportLimiter, validate(exportParamsSchema, 'params'), validate(reportQuerySchema, 'query'), controller.exportReport);
//# sourceMappingURL=report.routes.js.map