import { buildPagination, clampPaging } from './pagination.js';
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Case-insensitive "contains" search across several fields. The term is escaped (no regex injection). */
export function searchFilter(fields, term) {
    const t = term?.trim();
    if (!t)
        return {};
    const rx = new RegExp(escapeRegex(t), 'i');
    return { $or: fields.map((f) => ({ [f]: rx })) };
}
/** Sort spec restricted to an allow-list so clients cannot sort on arbitrary/unindexed fields. */
export function sortSpec(allowed, sortBy, sortOrder, fallback = { createdAt: -1 }) {
    if (!sortBy || !allowed.includes(sortBy))
        return fallback;
    return { [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: -1 };
}
export function dateRangeFilter(field, startDate, endDate) {
    if (!startDate && !endDate)
        return {};
    return { [field]: { ...(startDate && { $gte: startDate }), ...(endDate && { $lte: endDate }) } };
}
/** Runs the page query and the count in parallel and returns lean documents. */
export async function paginate(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
model, filter, { page, limit, sort = { createdAt: -1 }, select, populate } = {}) {
    const paging = clampPaging(page, limit);
    let query = model.find(filter).sort(sort).skip(paging.skip).limit(paging.limit);
    if (select)
        query = query.select(select);
    if (populate)
        query = query.populate(populate);
    const [data, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
    return { data: data, pagination: buildPagination(paging.page, paging.limit, total) };
}
//# sourceMappingURL=queryBuilder.js.map