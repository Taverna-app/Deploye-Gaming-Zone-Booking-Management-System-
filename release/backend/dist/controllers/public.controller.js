import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';
import * as service from '../services/public.service.js';
const slug = (req) => req.params.slug;
export const listBusinesses = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listBusinesses(req.validatedQuery);
    paginated(res, data, pagination);
});
export const getBusiness = asyncHandler(async (req, res) => {
    ok(res, await service.getBusiness(slug(req)));
});
export const listCategories = asyncHandler(async (req, res) => {
    ok(res, await service.listCategories(slug(req)));
});
export const listStations = asyncHandler(async (req, res) => {
    ok(res, await service.listStations(slug(req), req.validatedQuery.categoryId));
});
//# sourceMappingURL=public.controller.js.map