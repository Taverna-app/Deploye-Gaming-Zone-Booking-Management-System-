import { Schema, model } from 'mongoose';
import { INVITATION_STATUS } from '../types/enums.js';
const staffInvitationSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    role: { type: String, enum: ['STAFF', 'STORE_ADMIN'], default: 'STAFF' },
    /** SHA-256 of the emailed token; the raw token is never stored. */
    tokenHash: { type: String, required: true },
    status: { type: String, enum: INVITATION_STATUS, default: 'PENDING' },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: Date,
}, { timestamps: true });
staffInvitationSchema.index({ tokenHash: 1 }, { unique: true });
staffInvitationSchema.index({ businessId: 1, email: 1, status: 1 });
// Purge old invitations 30 days after they expire.
staffInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const StaffInvitation = model('StaffInvitation', staffInvitationSchema);
//# sourceMappingURL=StaffInvitation.js.map