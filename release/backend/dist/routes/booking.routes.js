import { Router } from 'express';
import * as controller from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { bookingNumberParamSchema, cancelBookingSchema, createBookingSchema, rescheduleBookingSchema, } from '../validators/booking.validator.js';
export const bookingRouter = Router();
bookingRouter.use(authenticate);
// Only customers create bookings here; staff use the admin walk-in endpoint.
bookingRouter.post('/', authorize('CUSTOMER'), validate(createBookingSchema), controller.create);
// Every role may read / change bookings it can access; the service scopes what "access" means.
bookingRouter.get('/:bookingNumber', validate(bookingNumberParamSchema, 'params'), controller.getByNumber);
bookingRouter.post('/:id/cancel', validate(idParamSchema, 'params'), validate(cancelBookingSchema), controller.cancel);
bookingRouter.post('/:id/reschedule', validate(idParamSchema, 'params'), validate(rescheduleBookingSchema), controller.reschedule);
//# sourceMappingURL=booking.routes.js.map