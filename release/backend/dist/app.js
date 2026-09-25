import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import { requestContext } from './middleware/requestContext.middleware.js';
export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(requestContext);
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(cookieParser());
    app.use('/api', apiLimiter, apiRouter);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map