import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { env } from './env.js';
import { Business, Station } from '../models/index.js';
import { resolveAuthUser } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
/**
 * Socket.IO server. Every connection is authenticated with the same JWT checks as the REST API; what a socket may
 * HEAR is decided by the rooms it joins, and the joins are derived server-side from the user's real account:
 *
 *   user:<id>                 everyone         - their own notifications and booking updates
 *   business:<id>             store admin/staff of that (ACTIVE) store - live bookings and stations
 *   business:<id>:admins      store admins only - payment events
 *   platform                  super admin      - platform-wide "something changed" signals
 *   avail:<stationId>         opt-in, any signed-in user - "this station's availability changed" (ids + date only)
 *
 * Customers never join a business room, so they can never receive another customer's data. Super admins reach a
 * particular store only by explicitly subscribing (the store switcher).
 */
export const rooms = {
    user: (id) => `user:${id}`,
    business: (id) => `business:${id}`,
    admins: (id) => `business:${id}:admins`,
    platform: 'platform',
    availability: (stationId) => `avail:${stationId}`,
};
const MAX_WATCHED_STATIONS = 20;
const MAX_EVENTS_PER_WINDOW = 60;
const WINDOW_MS = 10_000;
let io = null;
export const getIO = () => io;
export function socketStatus() {
    if (!io)
        return { status: 'DISCONNECTED', clients: 0 };
    return { status: 'CONNECTED', clients: io.engine.clientsCount };
}
/** Rooms a freshly connected user belongs to (only stores that are currently ACTIVE). */
async function roomsFor(user) {
    const joined = [rooms.user(user.id)];
    if (user.role === 'SUPER_ADMIN')
        joined.push(rooms.platform);
    if (user.role === 'STORE_ADMIN' || user.role === 'STAFF') {
        const active = await Business.find({ _id: { $in: user.businessIds }, status: 'ACTIVE' }).select('_id').lean();
        for (const b of active) {
            joined.push(rooms.business(String(b._id)));
            if (user.role === 'STORE_ADMIN')
                joined.push(rooms.admins(String(b._id)));
        }
    }
    return joined;
}
const reply = (ack, result) => typeof ack === 'function' && ack(result);
const isObjectId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && v.length === 24;
function registerHandlers(socket, user) {
    // A client that spams events is cut off rather than allowed to hammer the database.
    let windowStart = Date.now();
    let count = 0;
    socket.use((_packet, next) => {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS)
            [windowStart, count] = [now, 0];
        if (++count > MAX_EVENTS_PER_WINDOW) {
            socket.disconnect(true);
            return next(new Error('rate limited'));
        }
        next();
    });
    const watched = new Set();
    // Any signed-in user may watch a station's availability. Only ACTIVE stores' stations, and the events carry ids only.
    socket.on('watch:station', async (payload, ack) => {
        try {
            if (!isObjectId(payload?.stationId))
                return reply(ack, { ok: false, error: 'invalid station' });
            if (watched.size >= MAX_WATCHED_STATIONS && !watched.has(payload.stationId))
                return reply(ack, { ok: false, error: 'too many stations' });
            const station = await Station.findById(payload.stationId).select('businessId categoryId').lean();
            const business = station && (await Business.findOne({ _id: station.businessId, status: 'ACTIVE' }).select('_id').lean());
            if (!station || !business)
                return reply(ack, { ok: false, error: 'not found' });
            watched.add(payload.stationId);
            await socket.join(rooms.availability(payload.stationId));
            reply(ack, { ok: true });
        }
        catch (err) {
            logger.error('watch:station failed', { error: err.message });
            reply(ack, { ok: false, error: 'failed' });
        }
    });
    socket.on('unwatch:station', async (payload, ack) => {
        if (isObjectId(payload?.stationId)) {
            watched.delete(payload.stationId);
            await socket.leave(rooms.availability(payload.stationId));
        }
        reply(ack, { ok: true });
    });
    // The super admin's store switcher: choose which store's live events to follow. Nobody else may.
    socket.on('subscribe:business', async (payload, ack) => {
        if (user.role !== 'SUPER_ADMIN')
            return reply(ack, { ok: false, error: 'forbidden' });
        if (!isObjectId(payload?.businessId))
            return reply(ack, { ok: false, error: 'invalid business' });
        if (!(await Business.exists({ _id: payload.businessId })))
            return reply(ack, { ok: false, error: 'not found' });
        await socket.join([rooms.business(payload.businessId), rooms.admins(payload.businessId)]);
        reply(ack, { ok: true });
    });
    socket.on('unsubscribe:business', async (payload, ack) => {
        if (user.role === 'SUPER_ADMIN' && isObjectId(payload?.businessId)) {
            await socket.leave(rooms.business(payload.businessId));
            await socket.leave(rooms.admins(payload.businessId));
        }
        reply(ack, { ok: true });
    });
}
export function initSocket(server) {
    io = new Server(server, {
        cors: { origin: env.FRONTEND_URL, credentials: true },
        // Keep payloads small; nothing here needs to send large messages.
        maxHttpBufferSize: 10_000,
        serveClient: false,
    });
    io.use(async (socket, next) => {
        try {
            const fromAuth = socket.handshake.auth?.token;
            const header = socket.handshake.headers.authorization;
            const token = typeof fromAuth === 'string' ? fromAuth : header?.startsWith('Bearer ') ? header.slice(7) : '';
            if (!token)
                return next(new Error('unauthorized'));
            socket.data.user = await resolveAuthUser(token);
            next();
        }
        catch {
            next(new Error('unauthorized')); // never say why
        }
    });
    io.on('connection', async (socket) => {
        const user = socket.data.user;
        try {
            registerHandlers(socket, user); // before any await, so an eager client's first events are not lost
            await socket.join(await roomsFor(user));
            socket.emit('ready', { userId: user.id, role: user.role });
        }
        catch (err) {
            logger.error('Socket setup failed', { error: err.message });
            socket.disconnect(true);
        }
    });
    logger.info('Socket.IO ready');
    return io;
}
/** Drops every live connection of a user (their password changed, they were deactivated, ...). */
export async function disconnectUser(userId) {
    if (!io)
        return;
    const sockets = await io.in(rooms.user(userId)).fetchSockets();
    for (const s of sockets)
        s.disconnect(true);
}
/** Cuts off everyone following a store live (it was suspended or deactivated). Super admins can re-subscribe. */
export async function disconnectBusiness(businessId) {
    if (!io)
        return;
    const sockets = await io.in([rooms.business(businessId), rooms.admins(businessId)]).fetchSockets();
    for (const s of sockets)
        s.disconnect(true);
}
export async function closeSocket() {
    if (!io)
        return;
    const server = io;
    io = null;
    await new Promise((resolve) => server.close(() => resolve()));
}
//# sourceMappingURL=socket.js.map