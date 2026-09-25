import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';
import * as service from '../services/customer.service.js';
export const listBookings = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listBookings(req.user.id, req.validatedQuery);
    paginated(res, data, pagination);
});
export const listPayments = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listPayments(req.user.id, req.validatedQuery);
    paginated(res, data, pagination);
});
export const getProfile = asyncHandler(async (req, res) => {
    ok(res, await service.getProfile(req.user.id));
});
export const updateProfile = asyncHandler(async (req, res) => {
    ok(res, await service.updateProfile(req.user.id, req.body, req), 'Profile updated');
});
//# sourceMappingURL=customer.controller.js.map