import { Schema, model } from 'mongoose';
const auditLogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business' },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    ip: String,
    userAgent: String,
    metadata: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });
auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
export const AuditLog = model('AuditLog', auditLogSchema);
//# sourceMappingURL=AuditLog.js.map