import multer from 'multer';
import { env } from '../config/env.js';
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_MIME = new Set([...IMAGE_MIME, 'application/pdf']);
const IMAGE_ONLY_MIME = new Set(IMAGE_MIME);
/**
 * Single-file upload held in memory (size-capped) so the service can inspect the real file signature before
 * anything is written to storage. The declared MIME type is only a cheap first filter; the bytes decide.
 */
export const uploadSingle = (field, allowed = ALLOWED_MIME) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 },
    fileFilter: (_req, file, cb) => {
        if (allowed.has(file.mimetype))
            return cb(null, true);
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', field));
    },
}).single(field);
/** A picture only (no PDF): a store's logo or cover. */
export const uploadImage = (field) => uploadSingle(field, IMAGE_ONLY_MIME);
//# sourceMappingURL=upload.middleware.js.map