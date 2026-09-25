import { NotFoundError } from '../utils/errors.js';
/**
 * Loads a document only if it belongs to the tenant. A record from another tenant is reported as
 * "not found" (never "forbidden"), so ids of other stores' data cannot be probed.
 */
export async function findOwned(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
model, id, businessId, label) {
    const doc = await model.findOne({ _id: id, businessId }).lean();
    if (!doc)
        throw new NotFoundError(`${label} not found`);
    return doc;
}
/** Throws unless every referenced id exists inside the tenant. Guards cross-tenant references in request bodies. */
export async function assertOwned(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
model, id, businessId, label) {
    if (!id)
        return;
    if (!(await model.exists({ _id: id, businessId })))
        throw new NotFoundError(`${label} not found`);
}
//# sourceMappingURL=tenant.helper.js.map