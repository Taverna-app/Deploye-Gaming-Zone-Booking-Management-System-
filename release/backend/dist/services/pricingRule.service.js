import { GamingCategory, PricingRule, Station } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
import { paginate, sortSpec } from '../utils/queryBuilder.js';
import { assertOwned, findOwned } from '../helpers/tenant.helper.js';
import { assertRuleShape } from '../validators/pricing.validator.js';
import { audit } from './audit.service.js';
const SORT_FIELDS = ['name', 'ruleType', 'priority', 'createdAt'];
export async function listPricingRules(businessId, q) {
    const filter = {
        businessId,
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...(q.stationId && { stationId: q.stationId }),
        ...(q.ruleType && { ruleType: q.ruleType }),
        ...(q.active && { active: q.active === 'true' }),
    };
    return paginate(PricingRule, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(SORT_FIELDS, q.sortBy, q.sortOrder, { priority: -1, createdAt: 1 }),
        populate: [
            { path: 'categoryId', select: 'name' },
            { path: 'stationId', select: 'code name' },
        ],
    });
}
export async function getPricingRule(businessId, id) {
    return findOwned(PricingRule, id, businessId, 'Pricing rule');
}
export async function createPricingRule(businessId, input, req) {
    await assertOwned(GamingCategory, input.categoryId, businessId, 'Category');
    if (input.stationId) {
        // A station-specific rule must target a station of the same tenant AND the rule's category.
        const station = await Station.findOne({ _id: input.stationId, businessId, categoryId: input.categoryId }).select('_id').lean();
        if (!station)
            throw new NotFoundError('Station not found in this category');
    }
    const rule = await PricingRule.create({ ...input, businessId });
    await audit({ action: 'PRICING_RULE_CREATED', entity: 'PricingRule', entityId: rule._id, businessId, req, metadata: { name: rule.name, ruleType: rule.ruleType } });
    return rule.toJSON();
}
export async function updatePricingRule(businessId, id, input, req) {
    const existing = await findOwned(PricingRule, id, businessId, 'Pricing rule');
    const updates = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (input.stationId) {
        const station = await Station.findOne({ _id: input.stationId, businessId, categoryId: existing.categoryId }).select('_id').lean();
        if (!station)
            throw new NotFoundError('Station not found in this category');
    }
    // Changing which price kind a rule uses must replace the old one, not add a second.
    const priceKeys = ['pricePerHour', 'fixedPrice', 'multiplier'];
    const changedPrice = priceKeys.find((k) => input[k] !== undefined);
    const unset = {};
    if (changedPrice)
        for (const k of priceKeys)
            if (k !== changedPrice && existing[k] != null)
                unset[k] = '';
    const merged = { ...existing, ...updates, ...Object.fromEntries(Object.keys(unset).map((k) => [k, null])) };
    assertRuleShape(merged);
    const rule = await PricingRule.findOneAndUpdate({ _id: id, businessId }, { $set: updates, ...(Object.keys(unset).length && { $unset: unset }) }, { returnDocument: 'after', runValidators: true });
    await audit({ action: 'PRICING_RULE_UPDATED', entity: 'PricingRule', entityId: id, businessId, req, metadata: { fields: Object.keys(updates) } });
    return rule.toJSON();
}
export async function deletePricingRule(businessId, id, req) {
    await findOwned(PricingRule, id, businessId, 'Pricing rule');
    await PricingRule.deleteOne({ _id: id, businessId });
    await audit({ action: 'PRICING_RULE_DELETED', entity: 'PricingRule', entityId: id, businessId, req });
}
//# sourceMappingURL=pricingRule.service.js.map