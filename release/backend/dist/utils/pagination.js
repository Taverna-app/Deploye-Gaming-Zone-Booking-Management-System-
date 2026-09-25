export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export function buildPagination(page, limit, total) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 };
}
/** Clamp untrusted page/limit values. Result sets are never unbounded. */
export function clampPaging(page, limit) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const safePage = Math.max(Math.trunc(page ?? 1), 1);
    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}
//# sourceMappingURL=pagination.js.map