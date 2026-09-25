import { Schema, model } from 'mongoose';
const gamingCategorySchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: String,
    image: String,
    icon: String,
    /** The store does not publish a rate for this category: customers are told to contact it, and nothing in it can be priced or booked online. */
    priceOnRequest: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
}, { timestamps: true });
gamingCategorySchema.index({ businessId: 1, slug: 1 }, { unique: true });
gamingCategorySchema.index({ businessId: 1, active: 1, displayOrder: 1 });
export const GamingCategory = model('GamingCategory', gamingCategorySchema);
//# sourceMappingURL=GamingCategory.js.map