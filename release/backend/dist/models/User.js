import { Schema, model } from 'mongoose';
import { ROLES } from '../types/enums.js';
const userSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'CUSTOMER' },
    /** Tenants this user may access (STORE_ADMIN/STAFF). CUSTOMERs are platform-wide and have none. */
    businessIds: [{ type: Schema.Types.ObjectId, ref: 'Business' }],
    avatar: String,
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    /** Created by staff for a customer at the desk (may have a placeholder email and no way to sign in). */
    isWalkIn: { type: Boolean, default: false },
    /** Bumped on password change / logout-all to invalidate outstanding tokens. */
    tokenVersion: { type: Number, default: 0, select: false },
    lastLoginAt: Date,
}, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });
userSchema.index({ businessIds: 1 });
userSchema.set('toJSON', {
    transform: (_doc, ret) => {
        const out = ret;
        delete out.passwordHash;
        delete out.tokenVersion;
        delete out.__v;
        return out;
    },
});
export const User = model('User', userSchema);
//# sourceMappingURL=User.js.map