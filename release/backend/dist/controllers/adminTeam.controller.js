import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as staff from '../services/staff.service.js';
import * as promos from '../services/promo.service.js';
const id = (req) => req.params.id;
const me = (req) => req.user.id;
export const listTeam = asyncHandler(async (req, res) => {
    ok(res, await staff.listTeam(getTenantId(req)));
});
export const inviteStaff = asyncHandler(async (req, res) => {
    created(res, await staff.inviteStaff(getTenantId(req), req.body, me(req), req), 'Invitation sent');
});
export const updateStaff = asyncHandler(async (req, res) => {
    ok(res, await staff.updateStaff(getTenantId(req), id(req), req.body, req.user.id, req), 'Saved');
});
export const resendInvite = asyncHandler(async (req, res) => {
    ok(res, await staff.resendInvite(getTenantId(req), id(req), me(req), req), 'Invitation sent again');
});
export const listPromos = asyncHandler(async (req, res) => {
    const { data, pagination } = await promos.listPromos(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const createPromo = asyncHandler(async (req, res) => {
    created(res, await promos.createPromo(getTenantId(req), req.body, req), 'Promo code created');
});
export const updatePromo = asyncHandler(async (req, res) => {
    ok(res, await promos.updatePromo(getTenantId(req), id(req), req.body, req), 'Promo code updated');
});
export const deletePromo = asyncHandler(async (req, res) => {
    await promos.deletePromo(getTenantId(req), id(req), req);
    ok(res, null, 'Promo code deleted');
});
//# sourceMappingURL=adminTeam.controller.js.map