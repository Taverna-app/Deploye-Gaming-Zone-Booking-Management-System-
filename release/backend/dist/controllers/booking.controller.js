import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { actorFrom } from '../types/auth.types.js';
import * as service from '../services/booking.service.js';
export const create = asyncHandler(async (req, res) => {
    created(res, await service.createBooking(req.body, { customerId: req.user.id, createdBy: req.user.id }, req), 'Booking created');
});
export const getByNumber = asyncHandler(async (req, res) => {
    ok(res, await service.getBookingByNumber(req.params.bookingNumber, actorFrom(req)));
});
export const cancel = asyncHandler(async (req, res) => {
    ok(res, await service.cancelBooking(req.params.id, actorFrom(req), req.body.reason, req), 'Booking cancelled');
});
export const reschedule = asyncHandler(async (req, res) => {
    ok(res, await service.rescheduleBooking(req.params.id, req.body, actorFrom(req), req), 'Booking rescheduled');
});
//# sourceMappingURL=booking.controller.js.map