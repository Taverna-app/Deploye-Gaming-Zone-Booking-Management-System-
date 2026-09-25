import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import * as service from '../services/public.service.js';
export const availability = asyncHandler(async (req, res) => {
    ok(res, await service.getAvailability(req.params.slug, req.validatedQuery));
});
export const quote = asyncHandler(async (req, res) => {
    ok(res, await service.getQuote(req.params.slug, req.body));
});
//# sourceMappingURL=availability.controller.js.map