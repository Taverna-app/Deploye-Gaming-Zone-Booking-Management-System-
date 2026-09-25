import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import * as service from '../services/notification.service.js';
export const list = asyncHandler(async (req, res) => {
    const { data, pagination, unreadCount } = await service.listNotifications(req.user.id, req.validatedQuery);
    res.json({ success: true, data, pagination, unreadCount });
});
export const unreadCount = asyncHandler(async (req, res) => {
    ok(res, { unreadCount: await service.countUnread(req.user.id) });
});
export const markRead = asyncHandler(async (req, res) => {
    ok(res, await service.markRead(req.user.id, req.params.id), 'Marked as read');
});
export const markAllRead = asyncHandler(async (req, res) => {
    ok(res, await service.markAllRead(req.user.id), 'All notifications marked as read');
});
export const archive = asyncHandler(async (req, res) => {
    await service.archiveNotification(req.user.id, req.params.id);
    ok(res, null, 'Notification removed');
});
//# sourceMappingURL=notification.controller.js.map