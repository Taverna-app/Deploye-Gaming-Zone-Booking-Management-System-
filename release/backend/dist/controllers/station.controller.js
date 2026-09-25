import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as service from '../services/station.service.js';
const id = (req) => req.params.id;
export const list = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listStations(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await service.getStation(getTenantId(req), id(req)));
});
export const create = asyncHandler(async (req, res) => {
    created(res, await service.createStation(getTenantId(req), req.body, req), 'Station created');
});
export const update = asyncHandler(async (req, res) => {
    const { station, warning } = await service.updateStation(getTenantId(req), id(req), req.body, req);
    res.json({ success: true, data: station, message: 'Station updated', ...(warning && { warning }) });
});
export const remove = asyncHandler(async (req, res) => {
    await service.deleteStation(getTenantId(req), id(req), req);
    ok(res, null, 'Station deleted');
});
//# sourceMappingURL=station.controller.js.map