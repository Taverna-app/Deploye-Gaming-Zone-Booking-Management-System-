import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { actorFrom } from '../types/auth.types.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as ops from '../services/bookingOps.service.js';
import * as bookings from '../services/booking.service.js';
import * as calendar from '../services/calendar.service.js';
import * as stations from '../services/station.service.js';
const id = (req) => req.params.id;
export const list = asyncHandler(async (req, res) => {
    const { data, pagination } = await ops.listAdminBookings(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await ops.getAdminBooking(id(req), actorFrom(req)));
});
export const walkIn = asyncHandler(async (req, res) => {
    created(res, await ops.createWalkIn(getTenantId(req), req.body, actorFrom(req), req), 'Walk-in booking created');
});
export const update = asyncHandler(async (req, res) => {
    ok(res, await ops.updateAdminBooking(id(req), req.body, actorFrom(req), req), 'Booking updated');
});
export const confirm = asyncHandler(async (req, res) => {
    ok(res, await ops.confirmBooking(id(req), actorFrom(req), req), 'Booking confirmed');
});
export const checkIn = asyncHandler(async (req, res) => {
    ok(res, await ops.checkIn(id(req), actorFrom(req), req), 'Checked in');
});
export const checkOut = asyncHandler(async (req, res) => {
    ok(res, await ops.checkOut(id(req), req.body, actorFrom(req), req), 'Checked out');
});
export const noShow = asyncHandler(async (req, res) => {
    ok(res, await ops.markNoShow(id(req), req.body.reason, actorFrom(req), req), 'Marked as no-show');
});
export const extend = asyncHandler(async (req, res) => {
    ok(res, await ops.extendBooking(id(req), req.body, actorFrom(req), req), 'Session extended');
});
/** Cancel / reschedule reuse the customer-facing engine; the actor's role decides which rules apply. */
export const cancel = asyncHandler(async (req, res) => {
    ok(res, await bookings.cancelBooking(id(req), actorFrom(req), req.body.reason, req), 'Booking cancelled');
});
export const reschedule = asyncHandler(async (req, res) => {
    ok(res, await bookings.rescheduleBooking(id(req), req.body, actorFrom(req), req), 'Booking rescheduled');
});
export const getCalendar = asyncHandler(async (req, res) => {
    ok(res, await calendar.getCalendar(getTenantId(req), req.validatedQuery));
});
export const liveBoard = asyncHandler(async (req, res) => {
    ok(res, await stations.getLiveBoard(getTenantId(req)));
});
//# sourceMappingURL=adminBooking.controller.js.map