import { Schema, model } from 'mongoose';
import { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS, NOTIFICATION_TYPE } from '../types/enums.js';
const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business' },
    type: { type: String, enum: NOTIFICATION_TYPE, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNEL, default: 'IN_APP' },
    status: { type: String, enum: NOTIFICATION_STATUS, default: 'PENDING' },
    readAt: Date,
    archived: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ businessId: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);
//# sourceMappingURL=Notification.js.map