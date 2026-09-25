import { GamingCategory, PricingRule, Station } from '../models/index.js';
import { ConflictError } from '../utils/errors.js';
import { slugify } from '../utils/slug.js';
import { paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
import { findOwned } from '../helpers/tenant.helper.js';
import { audit } from './audit.service.js';
const SORT_FIELDS = ['name', 'displayOrder', 'createdAt'];
async function uniqueSlug(businessId, name, exceptId) {
    const base = slugify(name) || 'category';
    for (let i = 0;; i++) {
        const slug = i === 0 ? base : `${base}-${i + 1}`;
        const clash = await GamingCategory.exists({ businessId, slug, ...(exceptId && { _id: { $ne: exceptId } }) });
        if (!clash)
            return slug;
    }
}
export async function listCategories(businessId, q) {
    const filter = {
        businessId,
        ...searchFilter(['name', 'slug'], q.search),
        ...(q.active && { active: q.active === 'true' }),
    };
    const page = await paginate(GamingCategory, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(SORT_FIELDS, q.sortBy, q.sortOrder, { displayOrder: 1, name: 1 }),
    });
    const ids = page.data.map((c) => c._id);
    const counts = ids.length
        ? await Station.aggregate([
            { $match: { businessId: page.data[0].businessId, categoryId: { $in: ids } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        ])
        : [];
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return { data: page.data.map((c) => ({ ...c, stationCount: countMap.get(String(c._id)) ?? 0 })), pagination: page.pagination };
}
export async function getCategory(businessId, id) {
    return findOwned(GamingCategory, id, businessId, 'Category');
}
export async function createCategory(businessId, input, req) {
    const last = await GamingCategory.findOne({ businessId }).sort({ displayOrder: -1 }).select('displayOrder').lean();
    const category = await GamingCategory.create({
        ...input,
        businessId,
        slug: await uniqueSlug(businessId, input.name),
        displayOrder: input.displayOrder ?? (last ? last.displayOrder + 1 : 0),
    });
    await audit({ action: 'CATEGORY_CREATED', entity: 'GamingCategory', entityId: category._id, businessId, req, metadata: { name: category.name } });
    return category.toJSON();
}
export async function updateCategory(businessId, id, input, req) {
    const existing = await findOwned(GamingCategory, id, businessId, 'Category');
    const updates = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (input.name && input.name !== existing.name)
        updates.slug = await uniqueSlug(businessId, input.name, id);
    const category = await GamingCategory.findOneAndUpdate({ _id: id, businessId }, { $set: updates }, { returnDocument: 'after', runValidators: true });
    await audit({ action: 'CATEGORY_UPDATED', entity: 'GamingCategory', entityId: id, businessId, req, metadata: { fields: Object.keys(updates) } });
    return category.toJSON();
}
/** Categories that still have stations (which may have booking history) can only be deactivated. */
export async function deleteCategory(businessId, id, req) {
    await findOwned(GamingCategory, id, businessId, 'Category');
    if (await Station.exists({ businessId, categoryId: id })) {
        throw new ConflictError('This category still has stations. Remove them or deactivate the category instead.', 'CATEGORY_IN_USE');
    }
    await Promise.all([
        GamingCategory.deleteOne({ _id: id, businessId }),
        PricingRule.deleteMany({ businessId, categoryId: id }),
    ]);
    await audit({ action: 'CATEGORY_DELETED', entity: 'GamingCategory', entityId: id, businessId, req });
}
//# sourceMappingURL=category.service.js.map