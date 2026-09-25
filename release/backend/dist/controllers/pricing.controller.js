import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import * as rules from '../services/pricingRule.service.js';
import * as pricing from '../services/pricing.service.js';
const id = (req) => req.params.id;
export const list = asyncHandler(async (req, res) => {
    const { data, pagination } = await rules.listPricingRules(getTenantId(req), req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await rules.getPricingRule(getTenantId(req), id(req)));
});
export const create = asyncHandler(async (req, res) => {
    created(res, await rules.createPricingRule(getTenantId(req), req.body, req), 'Pricing rule created');
});
export const update = asyncHandler(async (req, res) => {
    ok(res, await rules.updatePricingRule(getTenantId(req), id(req), req.body, req), 'Pricing rule updated');
});
export const remove = asyncHandler(async (req, res) => {
    await rules.deletePricingRule(getTenantId(req), id(req), req);
    ok(res, null, 'Pricing rule deleted');
});
/** Shows exactly what the engine would charge for a slot, without creating anything. */
export const preview = asyncHandler(async (req, res) => {
    const body = req.body;
    ok(res, await pricing.calculatePrice({
        businessId: getTenantId(req),
        stationId: body.stationId,
        start: { date: body.date, time: body.startTime },
        durationMinutes: body.durationMinutes,
        promoCode: body.promoCode,
    }));
});
//# sourceMappingURL=pricing.controller.js.map