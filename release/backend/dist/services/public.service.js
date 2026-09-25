import { Business, GamingCategory, Station } from '../models/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { escapeRegex, paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
import { assertBookable, getAvailableSlots, getAvailableStations, getEffectiveSettings, isStationAvailable, validateBookingTime, } from './availability.service.js';
import { calculatePrice } from './pricing.service.js';
import { ratingSummaries, summaryFor } from './review.service.js';
/**
 * Fields of a business that may be shown to anyone. Deliberately an allow-list: bank details, createdBy,
 * subscription info etc. never leave through the public API.
 */
const PUBLIC_BUSINESS_FIELDS = 'name slug logo coverImage description phone whatsapp email address city country timezone currency openingTime closingTime branding';
/** Business settings a customer needs to book (limits and rules), nothing operational. */
const publicSettings = (s) => ({
    minimumBookingMinutes: s.minimumBookingMinutes,
    maximumBookingMinutes: s.maximumBookingMinutes,
    slotIntervalMinutes: s.slotIntervalMinutes,
    advanceBookingDays: s.advanceBookingDays,
    cancellationMinutes: s.cancellationMinutes,
    allowCancellation: s.allowCancellation,
    allowRescheduling: s.allowRescheduling,
    requireAdvancePayment: s.requireAdvancePayment,
    allowPayAtVenue: s.allowPayAtVenue,
    allowBankTransfer: s.allowBankTransfer,
    terms: s.terms,
    cancellationPolicy: s.cancellationPolicy,
});
/** Resolves a public store by slug. Suspended / inactive stores are indistinguishable from missing ones. */
async function findPublicBusiness(slug) {
    const business = await Business.findOne({ slug, status: 'ACTIVE' }).select(`${PUBLIC_BUSINESS_FIELDS} status subscriptionStatus`).lean();
    if (!business)
        throw new NotFoundError('Store not found');
    return business;
}
const stripInternal = ({ status: _s, subscriptionStatus: _x, ...rest }) => rest;
export async function listBusinesses(q) {
    let idFilter = {};
    if (q.type) {
        const ids = await GamingCategory.distinct('businessId', { active: true, name: new RegExp(escapeRegex(q.type), 'i') });
        idFilter = { _id: { $in: ids } };
    }
    const filter = {
        status: 'ACTIVE',
        ...idFilter,
        ...searchFilter(['name', 'city'], q.search),
        ...(q.city && { city: new RegExp(`^${escapeRegex(q.city)}$`, 'i') }),
    };
    const page = await paginate(Business, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(['name', 'city', 'createdAt'], q.sortBy, q.sortOrder, { name: 1 }),
        select: PUBLIC_BUSINESS_FIELDS,
    });
    const categories = page.data.length
        ? await GamingCategory.find({ businessId: { $in: page.data.map((b) => b._id) }, active: true }).sort({ displayOrder: 1 }).select('businessId name slug icon').lean()
        : [];
    const byBusiness = new Map();
    for (const c of categories) {
        const key = String(c.businessId);
        byBusiness.set(key, [...(byBusiness.get(key) ?? []), { name: c.name, slug: c.slug, icon: c.icon }]);
    }
    const ratings = await ratingSummaries(page.data.map((b) => b._id));
    return { data: page.data.map((b) => ({ ...b, categories: byBusiness.get(String(b._id)) ?? [], rating: { average: summaryFor(ratings, b._id).average, count: summaryFor(ratings, b._id).count } })), pagination: page.pagination };
}
export async function getBusiness(slug) {
    const business = await findPublicBusiness(slug);
    const [settings, categories, ratings] = await Promise.all([
        getEffectiveSettings(business._id),
        GamingCategory.find({ businessId: business._id, active: true }).sort({ displayOrder: 1 }).select('name slug description image icon priceOnRequest').lean(),
        ratingSummaries([business._id]),
    ]);
    return {
        ...stripInternal(business),
        rating: summaryFor(ratings, business._id),
        acceptingBookings: business.subscriptionStatus !== 'EXPIRED' && business.subscriptionStatus !== 'CANCELLED',
        settings: publicSettings(settings),
        categories,
    };
}
export async function listCategories(slug) {
    const business = await findPublicBusiness(slug);
    return GamingCategory.find({ businessId: business._id, active: true }).sort({ displayOrder: 1 }).select('name slug description image icon priceOnRequest').lean();
}
export async function listStations(slug, categoryId) {
    const business = await findPublicBusiness(slug);
    const activeCategories = await GamingCategory.find({ businessId: business._id, active: true }).select('_id').lean();
    const filter = {
        businessId: business._id,
        active: true,
        status: { $ne: 'INACTIVE' },
        categoryId: categoryId ? categoryId : { $in: activeCategories.map((c) => c._id) },
    };
    return Station.find(filter).sort({ code: 1 }).select('name code description capacity features image categoryId status').lean();
}
const MAX_GRID_STATIONS = 30;
export async function getAvailability(slug, q) {
    const business = await findPublicBusiness(slug);
    assertBookable(business);
    const businessId = String(business._id);
    if (q.stationId) {
        return { type: 'STATION_SLOTS', ...(await getAvailableSlots({ businessId, stationId: q.stationId, date: q.date, durationMinutes: q.durationMinutes })) };
    }
    if (q.startTime) {
        if (!q.durationMinutes)
            throw new ValidationError('durationMinutes is required with startTime');
        return {
            type: 'AVAILABLE_STATIONS',
            ...(await getAvailableStations({ businessId, categoryId: q.categoryId, date: q.date, startTime: q.startTime, durationMinutes: q.durationMinutes })),
        };
    }
    // categoryId only: a slot grid per station of that category.
    const stations = await Station.find({ businessId, categoryId: q.categoryId, active: true, status: { $ne: 'INACTIVE' } })
        .sort({ code: 1 })
        .limit(MAX_GRID_STATIONS)
        .select('_id')
        .lean();
    const grids = await Promise.all(stations.map((s) => getAvailableSlots({ businessId, stationId: String(s._id), date: q.date, durationMinutes: q.durationMinutes })));
    return { type: 'CATEGORY_GRID', date: q.date, stations: grids };
}
/**
 * Price quote for a slot: validates the slot exactly like a real booking would (hours, grid, duration,
 * availability of the station) and then runs the server-side pricing engine, promo included.
 * Nothing is created or reserved.
 */
export async function getQuote(slug, input) {
    const business = await findPublicBusiness(slug);
    assertBookable(business);
    const businessId = String(business._id);
    const settings = await getEffectiveSettings(businessId);
    const station = await Station.findOne({ _id: input.stationId, businessId }).select('code name status active capacity').lean();
    if (!station)
        throw new NotFoundError('Station not found');
    const time = validateBookingTime({ business: business, settings, date: input.date, startTime: input.startTime, durationMinutes: input.durationMinutes });
    const available = await isStationAvailable({ businessId, stationId: station._id, start: time.start, end: time.end });
    const quote = await calculatePrice({ businessId, stationId: input.stationId, start: time.start, durationMinutes: input.durationMinutes, promoCode: input.promoCode });
    const { promo, ...pricing } = quote;
    return {
        ...pricing,
        promoCode: promo?.code ?? null,
        available,
        bookingDate: time.bookingDate,
        startTime: time.startTime,
        endTime: time.endTime,
        station: { _id: station._id, code: station.code, name: station.name, capacity: station.capacity },
    };
}
//# sourceMappingURL=public.service.js.map