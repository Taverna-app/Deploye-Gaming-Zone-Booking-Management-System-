import http from 'node:http';
import { env } from './config/env.js';
import { productionProblems } from './config/productionChecks.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { closeSocket, initSocket } from './config/socket.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { flushBackground } from './utils/background.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './utils/migrations.js';
async function main() {
    const { errors, warnings } = productionProblems({ ...env, DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT });
    for (const w of warnings)
        logger.warn(`Configuration: ${w}`);
    if (errors.length) {
        for (const e of errors)
            logger.error(`Configuration: ${e}`);
        throw new Error('Refusing to start with an unsafe production configuration.');
    }
    await connectDatabase();
    await runMigrations();
    const server = http.createServer(createApp());
    initSocket(server);
    server.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`, { env: env.NODE_ENV }));
    if (env.SCHEDULER_ENABLED)
        startScheduler();
    let closing = false;
    const shutdown = (signal) => {
        if (closing)
            return;
        closing = true;
        logger.info(`${signal} received, shutting down`);
        stopScheduler();
        void closeSocket();
        server.close(() => {
            // Let in-flight emails finish before the process goes away.
            flushBackground()
                .then(() => disconnectDatabase())
                .catch(() => undefined)
                .finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { error: reason instanceof Error ? reason.message : String(reason) }));
}
main().catch((err) => {
    logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
});
//# sourceMappingURL=server.js.map