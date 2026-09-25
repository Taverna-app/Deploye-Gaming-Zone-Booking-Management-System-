import { Router } from 'express';
import * as controller from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { listNotificationsQuerySchema } from '../validators/customer.validator.js';
/** Every role reads its own notifications; queries are always scoped to the authenticated user. */
export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get('/', validate(listNotificationsQuerySchema, 'query'), controller.list);
notificationRouter.get('/unread-count', controller.unreadCount);
notificationRouter.put('/read-all', controller.markAllRead); // before /:id so "read-all" is not read as an id
notificationRouter.put('/:id/read', validate(idParamSchema, 'params'), controller.markRead);
notificationRouter.delete('/:id', validate(idParamSchema, 'params'), controller.archive);
//# sourceMappingURL=notification.routes.js.map