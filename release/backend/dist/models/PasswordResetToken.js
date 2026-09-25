import { Schema, model } from 'mongoose';
const passwordResetTokenSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** One-time emailed tokens share this collection: password reset and email verification. */
    purpose: { type: String, enum: ['PASSWORD_RESET', 'EMAIL_VERIFY'], default: 'PASSWORD_RESET' },
    /** SHA-256 of the emailed token; the raw token is never stored. */
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
}, { timestamps: true });
passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
export const PasswordResetToken = model('PasswordResetToken', passwordResetTokenSchema);
//# sourceMappingURL=PasswordResetToken.js.map