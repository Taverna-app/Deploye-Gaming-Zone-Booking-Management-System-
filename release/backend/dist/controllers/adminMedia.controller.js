import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as media from '../services/media.service.js';
const kind = (req) => req.params.kind;
export const upload = asyncHandler(async (req, res) => {
    ok(res, await media.setStoreImage(getTenantId(req), kind(req), req.file, req), 'Picture saved');
});
export const remove = asyncHandler(async (req, res) => {
    ok(res, await media.removeStoreImage(getTenantId(req), kind(req), req), 'Picture removed');
});
const item = (req) => ({ target: req.params.target, id: String(req.params.id) });
export const uploadItem = asyncHandler(async (req, res) => {
    const { target, id } = item(req);
    ok(res, await media.setItemImage(getTenantId(req), target, id, req.file, req), 'Picture saved');
});
export const removeItem = asyncHandler(async (req, res) => {
    const { target, id } = item(req);
    ok(res, await media.removeItemImage(getTenantId(req), target, id, req), 'Picture removed');
});
//# sourceMappingURL=adminMedia.controller.js.map