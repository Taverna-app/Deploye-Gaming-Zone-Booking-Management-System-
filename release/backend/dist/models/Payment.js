import { Schema, model } from 'mongoose';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '../types/enums.js';
const paymentSchema = new Schema({
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHOD, required: true },
    status: { type: String, enum: PAYMENT_STATUS, default: 'PENDING' },
    /** Customer-entered bank transfer reference / receipt number. */
    transactionReference: String,
    /** Private storage KEY (never a URL). Files are only served through an authorized endpoint. */
    proofImage: { type: String, select: false },
    proofUploadedAt: Date,
    rejectionReason: String,
    paidAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Who approved OR rejected it, and when. */
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    /** Online gateway bookkeeping. */
    provider: String,
    providerReference: String,
    refundReference: String,
    refundedAt: Date,
    refundReason: String,
}, { timestamps: true });
paymentSchema.index({ businessId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ customerId: 1, createdAt: -1 });
export const Payment = model('Payment', paymentSchema);
//# sourceMappingURL=Payment.js.map