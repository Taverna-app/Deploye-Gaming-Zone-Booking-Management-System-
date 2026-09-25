import { Business, BusinessSettings, GamingCategory, PricingRule, PromoCode, Station } from '../models/index.js';
import { NotFoundError, PriceOnRequestError, PricingError, ValidationError } from '../utils/errors.js';
import { roundMoney } from '../utils/currency.js';
import { zonedToUtc } from '../utils/dateTime.js';
import { priceBooking } from '../helpers/pricing.helper.js';
/** Active rules that can apply to a station: its own rules plus the category-wide ones. */
export async function getApplicableRules(businessId, categoryId, stationId, session) {
    const filter = {
        businessId,
        categoryId,
        active: true,
        $or: [{ stationId: { $exists: false } }, { stationId: null }, { stationId }],
    };
    return PricingRule.find(filter)
        .session(session ?? null)
        .lean();
}
export async function applyPromo(businessId, code, subtotal, opts = {}) {
    const { now = new Date(), session, alreadyRedeemed = false } = opts;
    const promo = await PromoCode.findOne({ businessId, code: code.trim().toUpperCase() }).session(session ?? null).lean();
    const invalid = (why) => new ValidationError(`Promo code ${why}`, [{ path: 'promoCode', message: why }]);
    if (!promo)
        throw invalid('is not valid');
    if (!alreadyRedeemed) {
        if (!promo.active)
            throw invalid('is not valid');
        if (promo.startDate && now < promo.startDate)
            throw invalid('is not active yet');
        if (promo.endDate && now > promo.endDate)
            throw invalid('has expired');
        if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit)
            throw invalid('has reached its usage limit');
        if (subtotal < promo.minimumAmount)
            throw invalid(`requires a minimum booking of ${promo.minimumAmount}`);
    }
    let discount = promo.discountType === 'PERCENTAGE' ? (subtotal * promo.value) / 100 : promo.value;
    if (promo.maximumDiscount != null)
        discount = Math.min(discount, promo.maximumDiscount);
    discount = roundMoney(Math.min(discount, subtotal));
    return { promoId: String(promo._id), code: promo.code, discountAmount: discount };
}
/** Atomically consumes one use. Fails if the limit was reached by a concurrent booking. */
export async function redeemPromo(promoId, session) {
    const updated = await PromoCode.findOneAndUpdate({ _id: promoId, $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] }, { $inc: { usedCount: 1 } }, { session });
    if (!updated)
        throw new ValidationError('Promo code has reached its usage limit', [{ path: 'promoCode', message: 'has reached its usage limit' }]);
}
/**
 * The single source of truth for what a booking costs: rules -> subtotal -> promo -> tax -> total.
 * Always computed server-side from the stored rules; nothing price-related is taken from the client.
 */
export async function calculatePrice(input) {
    const { businessId, stationId, durationMinutes, session } = input;
    const [station, business, settings] = await Promise.all([
        Station.findOne({ _id: stationId, businessId }).session(session ?? null).select('categoryId').lean(),
        Business.findById(businessId).session(session ?? null).select('timezone currency').lean(),
        BusinessSettings.findOne({ businessId }).session(session ?? null).select('taxPercent').lean(),
    ]);
    if (!station || !business)
        throw new NotFoundError('Station not found');
    if (await GamingCategory.exists({ _id: station.categoryId, priceOnRequest: true }))
        throw new PriceOnRequestError();
    const timezone = business.timezone ?? 'Asia/Karachi';
    const start = input.start instanceof Date ? input.start : zonedToUtc(input.start.date, input.start.time, timezone);
    const rules = await getApplicableRules(businessId, station.categoryId, stationId, session);
    if (rules.length === 0)
        throw new PricingError('Pricing is not configured for this station');
    const priced = priceBooking(rules, { start, durationMinutes, timezone });
    let discountAmount = 0;
    let promo = null;
    if (input.promoCode) {
        const applied = await applyPromo(businessId, input.promoCode, priced.baseAmount, {
            session,
            alreadyRedeemed: input.promoAlreadyRedeemed,
        });
        discountAmount = applied.discountAmount;
        promo = { id: applied.promoId, code: applied.code };
    }
    const taxPercent = settings?.taxPercent ?? 0;
    const taxable = roundMoney(priced.baseAmount - discountAmount);
    const taxAmount = roundMoney((taxable * taxPercent) / 100);
    return {
        ...priced,
        currency: business.currency ?? 'PKR',
        taxPercent,
        discountAmount,
        taxAmount,
        totalAmount: roundMoney(taxable + taxAmount),
        promo,
    };
}
//# sourceMappingURL=pricing.service.js.map