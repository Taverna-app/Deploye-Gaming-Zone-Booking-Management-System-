import { DateTime } from 'luxon';
import { Business, PromoCode } from '../models/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { localDate, zonedToUtc } from '../utils/dateTime.js';
import { paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
import { audit } from './audit.service.js';
async function timezoneOf(businessId) {
    const business = await Business.findById(businessId).select('timezone').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    return business.timezone;
}
/** Start of a local day, and the last instant of one, in the store's timezone. */
const dayStart = (date, tz) => zonedToUtc(date, '00:00', tz);
const dayEnd = (date, tz) => new Date(zonedToUtc(DateTime.fromFormat(date, 'yyyy-MM-dd').plus({ days: 1 }).toFormat('yyyy-MM-dd'), '00:00', tz).getTime() - 1);
/** A promo code as the store admin sees it, with its dates as local days and a plain-language state. */
function toView(p, tz, now = new Date()) {
    let state = 'ACTIVE';
    if (!p.active)
        state = 'OFF';
    else if (p.usageLimit != null && p.usedCount >= p.usageLimit)
        state = 'USED_UP';
    else if (p.startDate && now < p.startDate)
        state = 'SCHEDULED';
    else if (p.endDate && now > p.endDate)
        state = 'EXPIRED';
    return {
        _id: p._id,
        code: p.code,
        discountType: p.discountType,
        value: p.value,
        minimumAmount: p.minimumAmount,
        maximumDiscount: p.maximumDiscount ?? null,
        usageLimit: p.usageLimit ?? null,
        usedCount: p.usedCount,
        startsOn: p.startDate ? localDate(p.startDate, tz) : null,
        endsOn: p.endDate ? localDate(p.endDate, tz) : null,
        active: p.active,
        state,
    };
}
function assertShape(p) {
    const problems = [];
    if (p.discountType === 'PERCENTAGE' && p.value > 100)
        problems.push({ path: 'value', message: 'A percentage cannot be more than 100' });
    if (p.maximumDiscount != null && p.discountType === 'FIXED')
        problems.push({ path: 'maximumDiscount', message: 'A cap only applies to percentage discounts' });
    if (p.startsOn && p.endsOn && p.endsOn < p.startsOn)
        problems.push({ path: 'endsOn', message: 'The last day cannot be before the first day' });
    if (p.usageLimit != null && p.usedCount != null && p.usageLimit < p.usedCount)
        problems.push({ path: 'usageLimit', message: `It has already been used ${p.usedCount} times` });
    if (problems.length)
        throw new ValidationError('Invalid promo code', problems);
}
export async function listPromos(businessId, q) {
    const tz = await timezoneOf(businessId);
    const page = await paginate(PromoCode, { businessId, ...searchFilter(['code'], q.search), ...(q.active && { active: q.active === 'true' }) }, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['code', 'createdAt', 'usedCount'], q.sortBy, q.sortOrder, { createdAt: -1 }),
    });
    return { data: page.data.map((p) => toView(p, tz)), pagination: page.pagination };
}
export async function createPromo(businessId, input, req) {
    assertShape(input);
    if (await PromoCode.exists({ businessId, code: input.code }))
        throw new ConflictError(`The code ${input.code} already exists`, 'PROMO_CODE_TAKEN');
    const tz = await timezoneOf(businessId);
    const promo = await PromoCode.create({
        businessId,
        code: input.code,
        discountType: input.discountType,
        value: input.value,
        minimumAmount: input.minimumAmount,
        maximumDiscount: input.maximumDiscount ?? undefined,
        usageLimit: input.usageLimit ?? undefined,
        startDate: input.startsOn ? dayStart(input.startsOn, tz) : undefined,
        endDate: input.endsOn ? dayEnd(input.endsOn, tz) : undefined,
        active: input.active,
    });
    await audit({ action: 'PROMO_CREATED', entity: 'PromoCode', entityId: promo._id, businessId, req, metadata: { code: promo.code } });
    return toView(promo.toObject(), tz);
}
export async function updatePromo(businessId, id, input, req) {
    const existing = await PromoCode.findOne({ _id: id, businessId }).lean();
    if (!existing)
        throw new NotFoundError('Promo code not found');
    const tz = await timezoneOf(businessId);
    const current = toView(existing, tz);
    const merged = {
        discountType: input.discountType ?? existing.discountType,
        value: input.value ?? existing.value,
        maximumDiscount: input.maximumDiscount === undefined ? existing.maximumDiscount : input.maximumDiscount,
        usageLimit: input.usageLimit === undefined ? existing.usageLimit : input.usageLimit,
        usedCount: existing.usedCount,
        startsOn: input.startsOn === undefined ? current.startsOn : input.startsOn,
        endsOn: input.endsOn === undefined ? current.endsOn : input.endsOn,
    };
    // Switching to a fixed discount drops a leftover percentage cap instead of refusing the switch.
    if (merged.discountType === 'FIXED' && input.maximumDiscount === undefined)
        merged.maximumDiscount = null;
    assertShape(merged);
    const set = {};
    const unset = {};
    const put = (key, value) => (value === null || value === undefined ? (unset[key] = '') : (set[key] = value));
    if (input.discountType !== undefined)
        set.discountType = input.discountType;
    if (input.value !== undefined)
        set.value = input.value;
    if (input.minimumAmount !== undefined)
        set.minimumAmount = input.minimumAmount;
    if (input.active !== undefined)
        set.active = input.active;
    if (input.maximumDiscount !== undefined || merged.maximumDiscount !== (existing.maximumDiscount ?? null))
        put('maximumDiscount', merged.maximumDiscount);
    if (input.usageLimit !== undefined)
        put('usageLimit', input.usageLimit);
    if (input.startsOn !== undefined)
        put('startDate', input.startsOn && dayStart(input.startsOn, tz));
    if (input.endsOn !== undefined)
        put('endDate', input.endsOn && dayEnd(input.endsOn, tz));
    const updated = await PromoCode.findOneAndUpdate({ _id: id, businessId }, { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) }, { returnDocument: 'after', runValidators: true }).lean();
    await audit({ action: 'PROMO_UPDATED', entity: 'PromoCode', entityId: id, businessId, req, metadata: { code: existing.code, fields: Object.keys(input) } });
    return toView(updated, tz);
}
export async function deletePromo(businessId, id, req) {
    const promo = await PromoCode.findOne({ _id: id, businessId }).lean();
    if (!promo)
        throw new NotFoundError('Promo code not found');
    if (promo.usedCount > 0)
        throw new ConflictError('This code has been used, so it is kept for the record. Turn it off instead.', 'PROMO_IN_USE');
    await PromoCode.deleteOne({ _id: id, businessId });
    await audit({ action: 'PROMO_DELETED', entity: 'PromoCode', entityId: id, businessId, req, metadata: { code: promo.code } });
}
//# sourceMappingURL=promo.service.js.map