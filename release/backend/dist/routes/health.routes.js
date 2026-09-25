import { Router } from 'express';
import { env } from '../config/env.js';
import { getDatabaseState, pingDatabase } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
export const healthRouter = Router();
healthRouter.get('/', asyncHandler(async (_req, res) => {
    const dbOk = await pingDatabase();
    res.status(dbOk ? 200 : 503).json({
        success: dbOk,
        data: {
            api: 'CONNECTED',
            database: dbOk ? 'CONNECTED' : getDatabaseState(),
            environment: env.NODE_ENV,
            timestamp: new Date().toISOString(),
        },
    });
}));
//# sourceMappingURL=health.routes.js.map