import { Schema, model } from 'mongoose';
/** A store's PRIVATE note about one of its customers. Other stores and the customer never see it. */
const customerNoteSchema = new Schema({
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 2000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
customerNoteSchema.index({ businessId: 1, customerId: 1 }, { unique: true });
export const CustomerNote = model('CustomerNote', customerNoteSchema);
//# sourceMappingURL=CustomerNote.js.map