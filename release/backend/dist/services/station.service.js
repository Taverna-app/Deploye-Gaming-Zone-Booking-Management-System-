import { Booking, GamingCategory, PricingRule, Station } from '../models/index.js';
import { ACTIVE_BOOKING_STATUSES } from '../types/enums.js';
import { ConflictError } from '../utils/errors.js';
import { paginate, searchFilter, sortSpec } from '../utils/queryBuilder.js';
import { assertOwned, findOwned } from '../helpers/tenant.helper.js';
import { audit } from './audit.service.js';
import { publishStation } from './socket.service.js';
const SORT_FIELDS = ['name', 'code', 'status', 'createdAt'];
const upcomingBookings = (businessId, stationId) => Booking.countDocuments({
    businessId,
    stationId,
    bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    endDateTime: { $gt: new Date() },
});
export async function listStations(businessId, q) {
    const filter = {
        businessId,
        ...searchFilter(['name', 'code'], q.search),
        ...(q.categoryId && { categoryId: q.categoryId }),
        ...(q.status && { status: q.status }),
        ...(q.active && { active: q.active === 'true' }),
    };
    return paginate(Station, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(SORT_FIELDS, q.sortBy, q.sortOrder, { code: 1 }),
        populate: { path: 'categoryId', select: 'name slug icon' },
    });
}
export async function getStation(businessId, id) {
    return findOwned(Station, id, businessId, 'Station');
}
export async function createStation(businessId, input, req) {
    await assertOwned(GamingCategory, input.categoryId, businessId, 'Category');
    if (await Station.exists({ businessId, code: input.code })) {
        throw new ConflictError(`A station with code ${input.code} already exists`, 'STATION_CODE_TAKEN');
    }
    const station = await Station.create({ ...input, businessId, active: input.status !== 'INACTIVE' });
    await audit({ action: 'STATION_CREATED', entity: 'Station', entityId: station._id, businessId, req, metadata: { code: station.code } });
    publishStation('station:updated', station._id);
    return station.toJSON();
}
export async function updateStation(businessId, id, input, req) {
    const existing = await findOwned(Station, id, businessId, 'Station');
    const updates = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (input.categoryId && String(input.categoryId) !== String(existing.categoryId)) {
        await assertOwned(GamingCategory, input.categoryId, businessId, 'Category');
        // Station-specific pricing rules are tied to the category they were written for.
        if (await PricingRule.exists({ businessId, stationId: id })) {
            throw new ConflictError('Remove this station\'s pricing rules before moving it to another category', 'STATION_HAS_RULES');
        }
    }
    if (input.code && input.code !== existing.code && (await Station.exists({ businessId, code: input.code, _id: { $ne: id } }))) {
        throw new ConflictError(`A station with code ${input.code} already exists`, 'STATION_CODE_TAKEN');
    }
    // BOOKED / OCCUPIED are system-controlled; a manual status change overrides them.
    let warning;
    const unset = {};
    if (input.status) {
        updates.active = input.status !== 'INACTIVE';
        if (input.status !== 'AVAILABLE') {
            const count = await upcomingBookings(businessId, id);
            if (count > 0)
                warning = { upcomingBookings: count };
        }
        if (input.status !== 'MAINTENANCE') {
            delete updates.maintenanceReason;
            unset.maintenanceReason = '';
        }
    }
    const station = await Station.findOneAndUpdate({ _id: id, businessId }, { $set: updates, ...(Object.keys(unset).length && { $unset: unset }) }, { returnDocument: 'after', runValidators: true });
    await audit({
        action: 'STATION_UPDATED',
        entity: 'Station',
        entityId: id,
        businessId,
        req,
        metadata: { fields: Object.keys(input), ...(input.status && { from: existing.status, to: input.status }) },
    });
    publishStation(input.status && input.status !== existing.status ? 'station:status-changed' : 'station:updated', id);
    return { station: station.toJSON(), warning };
}
/** Stations with any booking history are kept for reporting; deactivate them instead. */
export async function deleteStation(businessId, id, req) {
    await findOwned(Station, id, businessId, 'Station');
    if (await Booking.exists({ businessId, stationId: id })) {
        throw new ConflictError('This station has booking history. Set it to INACTIVE instead of deleting it.', 'STATION_IN_USE');
    }
    await Promise.all([Station.deleteOne({ _id: id, businessId }), PricingRule.deleteMany({ businessId, stationId: id })]);
    await audit({ action: 'STATION_DELETED', entity: 'Station', entityId: id, businessId, req });
}
/* --------------------------------------------------------------- live board */
const BOOKED_LOOKAHEAD_MINUTES = 60;
/**
 * The floor view: what each station is doing RIGHT NOW, derived from bookings (the source of truth) rather than
 * trusted from a stored flag.
 *   OCCUPIED - a session is checked in
 *   BOOKED   - a booking starts within the next hour, or its start time has passed and nobody has checked in (`late`)
 *   AVAILABLE, MAINTENANCE, INACTIVE - as stored
 */
export async function getLiveBoard(businessId) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
    const [stations, bookings] = await Promise.all([
        Station.find({ businessId }).sort({ code: 1 }).select('code name categoryId status active capacity maintenanceReason').lean(),
        Booking.find({
            businessId,
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            endDateTime: { $gt: now },
            startDateTime: { $lt: horizon },
        })
            .sort({ startDateTime: 1 })
            .select('bookingNumber stationId customerId startDateTime endDateTime startTime endTime bookingStatus paymentStatus paymentMethod totalAmount numberOfPlayers checkedInAt')
            .populate('customerId', 'name phone')
            .lean(),
    ]);
    return stations.map((station) => {
        const mine = bookings.filter((b) => String(b.stationId) === String(station._id));
        const current = mine.find((b) => b.bookingStatus === 'CHECKED_IN') ?? null;
        const upcoming = mine.filter((b) => b.bookingStatus !== 'CHECKED_IN');
        const next = upcoming[0] ?? null;
        let liveStatus = station.status;
        let late = false;
        if (station.status === 'MAINTENANCE' || station.status === 'INACTIVE') {
            liveStatus = station.status;
        }
        else if (current) {
            liveStatus = 'OCCUPIED';
        }
        else if (next && next.startDateTime.getTime() <= now.getTime() + BOOKED_LOOKAHEAD_MINUTES * 60_000) {
            liveStatus = 'BOOKED';
            late = next.startDateTime <= now;
        }
        else {
            liveStatus = 'AVAILABLE';
        }
        return { station, liveStatus, late, current, next };
    });
}
//# sourceMappingURL=station.service.js.map