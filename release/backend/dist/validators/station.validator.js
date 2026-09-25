import { z } from 'zod';
import { STATION_STATUS } from '../types/enums.js';
import { listQuerySchema, objectId } from './common.validator.js';
/** Statuses an admin may set by hand. BOOKED / OCCUPIED are driven by bookings and check-in/out. */
export const MANUAL_STATION_STATUS = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];
const fields = {
    categoryId: objectId,
    name: z.string().trim().min(2).max(80),
    code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 letters, numbers or hyphens (e.g. PC-01)'),
    description: z.string().trim().max(500),
    adminNote: z.string().trim().max(500),
    capacity: z.number().int().min(1).max(100),
    features: z.array(z.string().trim().min(1).max(60)).max(20),
    image: z.string().trim().max(500),
    status: z.enum(MANUAL_STATION_STATUS),
    maintenanceReason: z.string().trim().max(300),
};
const needsReason = (v) => v.status !== 'MAINTENANCE' || Boolean(v.maintenanceReason);
const reasonIssue = { message: 'A maintenance reason is required', path: ['maintenanceReason'] };
export const createStationSchema = z
    .object({
    categoryId: fields.categoryId,
    name: fields.name,
    code: fields.code,
    description: fields.description.optional(),
    adminNote: fields.adminNote.optional(),
    capacity: fields.capacity.default(1),
    features: fields.features.default([]),
    image: fields.image.optional(),
    status: fields.status.default('AVAILABLE'),
    maintenanceReason: fields.maintenanceReason.optional(),
})
    .refine(needsReason, reasonIssue);
export const updateStationSchema = z
    .object(fields)
    .partial()
    .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update')
    .refine(needsReason, reasonIssue);
export const listStationsQuerySchema = listQuerySchema.extend({
    categoryId: objectId.optional(),
    status: z.enum(STATION_STATUS).optional(),
    active: z.enum(['true', 'false']).optional(),
});
//# sourceMappingURL=station.validator.js.map