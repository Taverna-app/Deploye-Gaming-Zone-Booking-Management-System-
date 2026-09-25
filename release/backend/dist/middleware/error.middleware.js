import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError, NotFoundError, TooManyRequestsError } from '../utils/errors.js';
import { isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';
export const notFoundHandler = (req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
};
export const errorHandler = (err, req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let errors = [];
    if (err instanceof AppError) {
        ({ statusCode: status, code, message, errors } = err);
        if (err instanceof TooManyRequestsError && err.retryAfterSeconds)
            res.setHeader('Retry-After', String(err.retryAfterSeconds));
    }
    else if (err instanceof ZodError) {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Validation failed';
        errors = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    }
    else if (err instanceof multer.MulterError) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        status = tooBig ? 413 : 400;
        code = tooBig ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD';
        message = tooBig ? 'That file is too large' : 'Upload a JPEG, PNG, WebP or PDF file';
    }
    else if (err instanceof mongoose.Error.ValidationError) {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Validation failed';
        errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    }
    else if (err instanceof mongoose.Error.CastError) {
        status = 400;
        code = 'INVALID_ID';
        message = `Invalid value for ${err.path}`;
    }
    else if (err?.code === 11000) {
        status = 409;
        code = 'DUPLICATE';
        message = 'A record with the same unique value already exists';
    }
    else if (err?.type === 'entity.parse.failed') {
        status = 400;
        code = 'INVALID_JSON';
        message = 'Malformed JSON body';
    }
    else if (err?.type === 'entity.too.large') {
        status = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'The request is too large';
    }
    else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.expose) {
        // Other client mistakes reported by the body parser (unsupported charset or encoding, aborted request, ...).
        status = err.status;
        code = 'BAD_REQUEST';
        message = 'The request could not be read';
    }
    if (status >= 500) {
        logger.error('Unhandled error', {
            requestId: res.locals.requestId,
            method: req.method,
            path: req.path,
            error: err instanceof Error ? err.message : String(err),
            ...(isProd ? {} : { stack: err instanceof Error ? err.stack : undefined }),
        });
        if (isProd)
            message = 'Internal server error';
    }
    res.status(status).json({ success: false, message, code, errors, ...(res.locals.requestId && { requestId: res.locals.requestId }) });
};
//# sourceMappingURL=error.middleware.js.map