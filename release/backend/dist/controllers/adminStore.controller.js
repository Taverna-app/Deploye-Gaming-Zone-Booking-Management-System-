import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import { getStoreContext } from '../services/business.service.js';
import * as settings from '../services/storeSettings.service.js';
export const context = asyncHandler(async (req, res) => {
    ok(res, await getStoreContext(getTenantId(req)));
});
export const getSettings = asyncHandler(async (req, res) => {
    ok(res, await settings.getStoreSettings(getTenantId(req)));
});
export const updateSettings = asyncHandler(async (req, res) => {
    ok(res, await settings.updateStoreSettings(getTenantId(req), req.body, req), 'Settings saved');
});
//# sourceMappingURL=adminStore.controller.js.map