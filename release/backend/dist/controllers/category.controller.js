import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as service from '../services/category.service.js';
const id = (req) => req.params.id;
export const list = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listCategories(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await service.getCategory(getTenantId(req), id(req)));
});
export const create = asyncHandler(async (req, res) => {
    created(res, await service.createCategory(getTenantId(req), req.body, req), 'Category created');
});
export const update = asyncHandler(async (req, res) => {
    ok(res, await service.updateCategory(getTenantId(req), id(req), req.body, req), 'Category updated');
});
export const remove = asyncHandler(async (req, res) => {
    await service.deleteCategory(getTenantId(req), id(req), req);
    ok(res, null, 'Category deleted');
});
//# sourceMappingURL=category.controller.js.map