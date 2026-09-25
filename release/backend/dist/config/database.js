import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
let lastError = null;
let listenersAttached = false;
function configureDns() {
    // Optional: only for networks where SRV lookups fail. Leave unset on Vercel.
    if (!env.MONGODB_DNS_SERVERS)
        return;
    const servers = env.MONGODB_DNS_SERVERS.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (servers.length) {
        dns.setServers(servers);
        logger.info('Custom DNS servers configured for MongoDB SRV resolution');
    }
}
function attachListeners() {
    if (listenersAttached)
        return;
    listenersAttached = true;
    const conn = mongoose.connection;
    conn.on('connected', () => {
        lastError = null;
        logger.info('MongoDB connected', { db: conn.name });
    });
    conn.on('disconnected', () => logger.warn('MongoDB disconnected'));
    conn.on('reconnected', () => logger.info('MongoDB reconnected'));
    conn.on('error', (err) => {
        lastError = err.name;
        logger.error('MongoDB error', { error: err.message });
    });
}
export async function connectDatabase() {
    configureDns();
    attachListeners();
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB,
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 20,
        autoIndex: env.NODE_ENV !== 'production',
    });
}
export async function disconnectDatabase() {
    await mongoose.disconnect();
}
export function getDatabaseState() {
    switch (mongoose.connection.readyState) {
        case 1:
            return 'CONNECTED';
        case 2:
            return 'CONNECTING';
        default:
            return lastError ? 'ERROR' : 'DISCONNECTED';
    }
}
/** Active ping - used by health checks. */
export async function pingDatabase() {
    try {
        if (mongoose.connection.readyState !== 1 || !mongoose.connection.db)
            return false;
        await mongoose.connection.db.admin().ping();
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=database.js.map