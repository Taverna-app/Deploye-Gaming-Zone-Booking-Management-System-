import { Schema, model } from 'mongoose';
/** Atomic sequence counters (e.g. booking numbers per business per day). */
const counterSchema = new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});
export const Counter = model('Counter', counterSchema);
/** Atomically returns the next value for `key`. Pass a session to keep it inside a transaction. */
export async function nextSequence(key, session) {
    const doc = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session, setDefaultsOnInsert: true }).lean();
    return doc.seq;
}
//# sourceMappingURL=Counter.js.map