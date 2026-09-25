import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as customers from '../services/customerAdmin.service.js';
export const list = asyncHandler(async (req, res) => {
    const { data, pagination } = await customers.listStoreCustomers(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await customers.getStoreCustomer(getTenantId(req), req.params.id));
});
export const setNote = asyncHandler(async (req, res) => {
    ok(res, await customers.setCustomerNote(getTenantId(req), req.params.id, req.body.notes, req), 'Saved');
});
//# sourceMappingURL=customerAdmin.controller.js.map