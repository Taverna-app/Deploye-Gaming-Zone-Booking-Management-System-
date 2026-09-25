import { Schema, model } from 'mongoose';
import { STATION_STATUS } from '../types/enums.js';
const stationSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'GamingCategory', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: String,
    /** A private note for the store's own team. Never sent to customers. */
    adminNote: String,
    capacity: { type: Number, default: 1, min: 1 },
    features: [String],
    image: String,
    status: { type: String, enum: STATION_STATUS, default: 'AVAILABLE' },
    maintenanceReason: String,
    active: { type: Boolean, default: true },
    /**
     * Written inside the booking transaction. Two concurrent bookings for the same station both
     * $inc this field, so MongoDB raises a write conflict for one of them - this serializes
     * overlap checks per station (see booking.service, Phase 6).
     */
    bookingVersion: { type: Number, default: 0 },
}, { timestamps: true });
stationSchema.index({ businessId: 1, code: 1 }, { unique: true });
stationSchema.index({ businessId: 1, categoryId: 1 });
stationSchema.index({ businessId: 1, status: 1 });
export const Station = model('Station', stationSchema);
//# sourceMappingURL=Station.js.map