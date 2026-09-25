import { Booking, Business, BusinessSettings, GamingCategory, PricingRule, Station } from '../models/index.js';
import { ACTIVE_BOOKING_STATUSES } from '../types/enums.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { addMinutes, localDate, localTime } from '../utils/dateTime.js';
import { businessDayWindow, buildSlots, daysBetween, isOnSlotGrid, startInstant, } from '../helpers/availability.helper.js';
import { priceBooking } from '../helpers/pricing.helper.js';
import { calculatePrice } from './pricing.service.js';
/** Defaults mirror the BusinessSettings schema, so a store without a settings document still works. */
const SETTING_DEFAULTS = {
    minimumBookingMinutes: 60,
    maximumBookingMinutes: 480,
    slotIntervalMinutes: 30,
    advanceBookingDays: 30,
    cancellationMinutes: 120,
    allowCancellation: true,
    allowRescheduling: true,
    allowWalkIn: true,
    requireAdvancePayment: false,
    allowPayAtVenue: true,
    allowBankTransfer: true,
    paymentHoldMinutes: 120,
    noShowGraceMinutes: 0,
    enableEmailNotifications: true,
    enableWhatsAppNotifications: true,
    taxPercent: 0,
};
export async function getEffectiveSettings(businessId, session) {
    const doc = await BusinessSettings.findOne({ businessId }).session(session ?? null).lean();
    return { ...SETTING_DEFAULTS, ...(doc ?? {}) };
}
/** Only ACTIVE stores with a live (trial / active) subscription take new bookings. */
export function assertBookable(business) {
    if (business.status !== 'ACTIVE')
        throw new NotFoundError('Store not found');
    if (business.subscriptionStatus === 'EXPIRED' || business.subscriptionStatus === 'CANCELLED') {
        throw new ValidationError('This store is not accepting bookings right now');
    }
}
export const isStationBookable = (s) => s.active !== false && s.status !== 'MAINTENANCE' && s.status !== 'INACTIVE';
export function validateDuration(durationMinutes, settings) {
    const { minimumBookingMinutes: min, maximumBookingMinutes: max, slotIntervalMinutes: step } = settings;
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0)
        throw new ValidationError('Invalid duration');
    if (durationMinutes % step !== 0)
        throw new ValidationError(`Duration must be a multiple of ${step} minutes`);
    if (durationMinutes < min)
        throw new ValidationError(`Minimum booking is ${min} minutes`);
    if (durationMinutes > max)
        throw new ValidationError(`Maximum booking is ${max} minutes`);
}
/**
 * Validates a requested slot against opening hours, the slot grid, duration limits, the advance-booking
 * window and "not in the past". `date` is the business day; `startTime` is local wall-clock time.
 * `allowStartedSlot` lets staff record a walk-in for the slot that is already running.
 */
export function validateBookingTime(opts) {
    const { business, settings, date, startTime, durationMinutes, now = new Date(), allowStartedSlot = false } = opts;
    const tz = business.timezone;
    validateDuration(durationMinutes, settings);
    const { open, close } = businessDayWindow(date, business.openingTime, business.closingTime, tz);
    const start = startInstant(date, startTime, business.openingTime, business.closingTime, tz);
    const end = addMinutes(start, durationMinutes);
    if (start < open || end > close) {
        throw new ValidationError(`Selected time is outside opening hours (${business.openingTime}-${business.closingTime})`);
    }
    if (!isOnSlotGrid(start, open, settings.slotIntervalMinutes)) {
        throw new ValidationError(`Start time must be on a ${settings.slotIntervalMinutes}-minute slot`);
    }
    const earliest = allowStartedSlot ? addMinutes(now, -settings.slotIntervalMinutes + 1) : now;
    if (start < earliest)
        throw new ValidationError('That time has already passed');
    if (daysBetween(localDate(now, tz), date) > settings.advanceBookingDays) {
        throw new ValidationError(`Bookings can be made up to ${settings.advanceBookingDays} days in advance`);
    }
    return { start, end, open, close, bookingDate: date, startTime: localTime(start, tz), endTime: localTime(end, tz) };
}
/** True when no ACTIVE booking overlaps [start, end). Cancelled / completed / no-show bookings never block. */
export async function isSlotFree({ businessId, stationId, start, end, excludeBookingId, session }) {
    const filter = {
        businessId,
        stationId,
        bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
        startDateTime: { $lt: end },
        endDateTime: { $gt: start },
        ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
    };
    return !(await Booking.exists(filter).session(session ?? null));
}
/** Station is bookable (active, not in maintenance) AND its time slot is free. */
export async function isStationAvailable(check) {
    const station = await Station.findOne({ _id: check.stationId, businessId: check.businessId })
        .session(check.session ?? null)
        .select('active status')
        .lean();
    if (!station || !isStationBookable(station))
        return false;
    return isSlotFree(check);
}
async function loadStoreContext(businessId) {
    const [business, settings] = await Promise.all([
        Business.findById(businessId).lean(),
        getEffectiveSettings(businessId),
    ]);
    if (!business)
        throw new NotFoundError('Store not found');
    return { business, settings };
}
/** Slot grid for one station on one business day, each slot marked free/booked/past with its price. */
export async function getAvailableSlots(opts) {
    const { businessId, stationId, date, now = new Date(), allowStartedSlot = false } = opts;
    const { business, settings } = await loadStoreContext(businessId);
    const station = await Station.findOne({ _id: stationId, businessId }).lean();
    if (!station)
        throw new NotFoundError('Station not found');
    const durationMinutes = opts.durationMinutes ?? settings.minimumBookingMinutes;
    validateDuration(durationMinutes, settings);
    const priceOnRequest = Boolean(await GamingCategory.exists({ _id: station.categoryId, priceOnRequest: true }));
    const tz = business.timezone;
    const { open, close } = businessDayWindow(date, business.openingTime, business.closingTime, tz);
    const base = {
        date,
        timezone: tz,
        openingTime: business.openingTime,
        closingTime: business.closingTime,
        durationMinutes,
        slotIntervalMinutes: settings.slotIntervalMinutes,
        currency: business.currency,
        priceOnRequest,
        station: { _id: station._id, code: station.code, name: station.name, categoryId: station.categoryId, status: station.status },
    };
    const today = localDate(now, tz);
    if (date < today)
        return { ...base, bookable: false, reason: 'PAST_DATE', slots: [] };
    if (daysBetween(today, date) > settings.advanceBookingDays)
        return { ...base, bookable: false, reason: 'BEYOND_ADVANCE_WINDOW', slots: [] };
    if (!isStationBookable(station)) {
        const reason = station.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'INACTIVE';
        return { ...base, bookable: false, reason, slots: [] };
    }
    const [busy, rules] = await Promise.all([
        Booking.find({
            businessId,
            stationId,
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            startDateTime: { $lt: close },
            endDateTime: { $gt: open },
        })
            .select('startDateTime endDateTime')
            .lean(),
        PricingRule.find({
            businessId,
            categoryId: station.categoryId,
            active: true,
            $or: [{ stationId: { $exists: false } }, { stationId: null }, { stationId: station._id }],
        }).lean(),
    ]);
    const earliestStart = allowStartedSlot ? addMinutes(now, -settings.slotIntervalMinutes + 1) : now;
    const slots = buildSlots({ open, close, intervalMinutes: settings.slotIntervalMinutes, durationMinutes, busy, earliestStart, timezone: tz }).map((s) => {
        let price = null;
        if (s.available && !priceOnRequest) {
            try {
                price = priceBooking(rules, { start: s.startDateTime, durationMinutes, timezone: tz }).baseAmount;
            }
            catch {
                price = null; // pricing not configured for this slot
            }
        }
        return { ...s, price };
    });
    return { ...base, bookable: true, slots };
}
/** Stations of a category that are bookable AND free for the whole requested window. */
export async function getAvailableStations(opts) {
    const { businessId, categoryId, date, startTime, durationMinutes, now } = opts;
    const { business, settings } = await loadStoreContext(businessId);
    assertBookable(business);
    const { start, end, bookingDate, endTime } = validateBookingTime({ business, settings, date, startTime, durationMinutes, now });
    const stations = await Station.find({ businessId, ...(categoryId && { categoryId }), active: true, status: { $nin: ['MAINTENANCE', 'INACTIVE'] } })
        .sort({ code: 1 })
        .select('name code description capacity features image categoryId status') // what customers may see, nothing internal
        .lean();
    const busyIds = new Set((await Booking.find({
        businessId,
        stationId: { $in: stations.map((s) => s._id) },
        bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
        startDateTime: { $lt: end },
        endDateTime: { $gt: start },
    })
        .select('stationId')
        .lean()).map((b) => String(b.stationId)));
    const rules = (await PricingRule.find({ businessId, active: true }).lean());
    const onRequest = new Set((await GamingCategory.find({ businessId, priceOnRequest: true }).select('_id').lean()).map((c) => String(c._id)));
    const available = stations
        .filter((s) => !busyIds.has(String(s._id)))
        .map((s) => {
        const applicable = rules.filter((r) => String(r.categoryId) === String(s.categoryId) && (!r.stationId || String(r.stationId) === String(s._id)));
        let price = null;
        try {
            if (onRequest.has(String(s.categoryId)))
                throw new Error('price on request');
            price = priceBooking(applicable, { start, durationMinutes, timezone: business.timezone }).baseAmount;
        }
        catch {
            price = null;
        }
        return { ...s, price };
    });
    return { bookingDate, startTime, endTime, durationMinutes, currency: business.currency, stations: available.map((s) => ({ ...s, priceOnRequest: onRequest.has(String(s.categoryId)) })) };
}
/** Server-side price for a slot (rules + promo + tax). Thin wrapper kept here so booking code has one entry point. */
export function calculateBookingPrice(input) {
    return calculatePrice(input);
}
/** Pure slot-grid calculation (see helpers/availability.helper). */
export const calculateAvailableSlots = buildSlots;
//# sourceMappingURL=availability.service.js.map