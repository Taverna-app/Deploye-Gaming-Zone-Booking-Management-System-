import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';
/** Records an audit event. Never throws - auditing must not break the request that triggered it. */
export async function audit(entry) {
    try {
        const { req } = entry;
        await AuditLog.create({
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId ? String(entry.entityId) : undefined,
            userId: entry.userId ?? req?.user?.id,
            businessId: entry.businessId ?? req?.tenantId,
            ip: req?.ip,
            userAgent: req?.headers?.['user-agent']?.slice(0, 300),
            metadata: {
                ...entry.metadata,
                ...(req?.user?.impersonatedBy ? { impersonatedBy: req.user.impersonatedBy } : {}),
            },
        });
    }
    catch (err) {
        logger.error('Failed to write audit log', { action: entry.action, error: err.message });
    }
}
//# sourceMappingURL=audit.service.js.map