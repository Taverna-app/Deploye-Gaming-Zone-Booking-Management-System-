import { Router } from 'express';
import * as controller from '../controllers/adminBooking.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { cancelBookingSchema, rescheduleBookingSchema } from '../validators/booking.validator.js';
import { calendarQuerySchema, checkOutSchema, extendSchema, listAdminBookingsQuerySchema, noShowSchema, updateAdminBookingSchema, walkInSchema, } from '../validators/adminBooking.validator.js';
/**
 * /api/admin/bookings and /api/admin/calendar. Mounted under the tenant-scoped admin router, so every handler is
 * already limited to the caller's own store. Store admins AND desk staff may run bookings day to day.
 */
export const adminBookingRouter = Router();
const params = validate(idParamSchema, 'params');
adminBookingRouter.get('/', validate(listAdminBookingsQuerySchema, 'query'), controller.list);
adminBookingRouter.post('/', validate(walkInSchema), controller.walkIn);
adminBookingRouter.get('/:id', params, controller.get);
adminBookingRouter.put('/:id', params, validate(updateAdminBookingSchema), controller.update);
adminBookingRouter.post('/:id/confirm', params, controller.confirm);
adminBookingRouter.post('/:id/cancel', params, validate(cancelBookingSchema), controller.cancel);
adminBookingRouter.post('/:id/reschedule', params, validate(rescheduleBookingSchema), controller.reschedule);
adminBookingRouter.post('/:id/check-in', params, controller.checkIn);
adminBookingRouter.post('/:id/check-out', params, validate(checkOutSchema), controller.checkOut);
adminBookingRouter.post('/:id/no-show', params, validate(noShowSchema), controller.noShow);
adminBookingRouter.post('/:id/extend', params, validate(extendSchema), controller.extend);
export const adminCalendarRouter = Router();
adminCalendarRouter.get('/', validate(calendarQuerySchema, 'query'), controller.getCalendar);
//# sourceMappingURL=adminBooking.routes.js.map