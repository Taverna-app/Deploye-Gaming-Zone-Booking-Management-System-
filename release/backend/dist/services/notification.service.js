import { Notification } from '../models/Notification.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { paginate } from '../utils/queryBuilder.js';
import { publishNotification } from './socket.service.js';
/**
 * Creates an in-app notification. Never throws (a failed notification must not fail the action that
 * triggered it). Email/WhatsApp fan-out and Socket.IO delivery are layered on in later phases.
 */
export async function createNotification(input) {
    try {
        const created = await Notification.create({ ...input, channel: input.channel ?? 'IN_APP', status: input.status ?? 'SENT' });
        if (created.channel === 'IN_APP')
            publishNotification(created); // real-time delivery to the owner's open tabs
        return created;
    }
    catch (err) {
        logger.error('Failed to create notification', { type: input.type, error: err.message });
        return null;
    }
}
/* ---------------------------------------------------------------- reading */
/** The user's own in-app notifications (archived ones are hidden). Always scoped by `userId`. */
export async function listNotifications(userId, q) {
    const filter = {
        userId,
        channel: 'IN_APP',
        archived: { $ne: true },
        ...(q.unread === 'true' && { readAt: { $exists: false } }),
        ...(q.unread === 'false' && { readAt: { $exists: true } }),
    };
    const [page, unreadCount] = await Promise.all([
        paginate(Notification, filter, { page: q.page, limit: q.limit, sort: { createdAt: -1 } }),
        countUnread(userId),
    ]);
    return { ...page, unreadCount };
}
export const countUnread = (userId) => Notification.countDocuments({ userId, channel: 'IN_APP', archived: { $ne: true }, readAt: { $exists: false } });
export async function markRead(userId, id) {
    const updated = await Notification.findOneAndUpdate({ _id: id, userId }, { $set: { readAt: new Date(), status: 'READ' } }, { returnDocument: 'after' }).lean();
    if (!updated)
        throw new NotFoundError('Notification not found');
    return updated;
}
export async function markAllRead(userId) {
    const res = await Notification.updateMany({ userId, channel: 'IN_APP', readAt: { $exists: false } }, { $set: { readAt: new Date(), status: 'READ' } });
    return { updated: res.modifiedCount };
}
export async function archiveNotification(userId, id) {
    const res = await Notification.updateOne({ _id: id, userId }, { $set: { archived: true } });
    if (res.matchedCount === 0)
        throw new NotFoundError('Notification not found');
}
//# sourceMappingURL=notification.service.js.map