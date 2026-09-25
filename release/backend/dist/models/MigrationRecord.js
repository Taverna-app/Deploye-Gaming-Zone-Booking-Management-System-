import { Schema, model } from 'mongoose';
/** Which one-off data migrations have already run on this database. */
const migrationSchema = new Schema({ name: { type: String, required: true }, ranAt: { type: Date, default: Date.now }, details: Schema.Types.Mixed });
migrationSchema.index({ name: 1 }, { unique: true });
export const MigrationRecord = model('MigrationRecord', migrationSchema);
//# sourceMappingURL=MigrationRecord.js.map