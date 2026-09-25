import { Schema, model } from 'mongoose';
import { REVIEW_STATUS } from '../types/enums.js';
const reviewSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1500 },
    status: { type: String, enum: REVIEW_STATUS, default: 'APPROVED' },
}, { timestamps: true });
reviewSchema.index({ bookingId: 1 }, { unique: true }); // one review per booking
reviewSchema.index({ businessId: 1, status: 1, createdAt: -1 });
export const Review = model('Review', reviewSchema);
//# sourceMappingURL=Review.js.map