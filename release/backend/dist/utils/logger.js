import { isProd } from '../config/env.js';
const SENSITIVE = /(password|passwd|secret|token|authorization|mongodb_uri|smtp_password|cookie)/i;
function redact(value, depth = 0) {
    if (depth > 4 || value === null || typeof value !== 'object')
        return value;
    if (value instanceof Error)
        return { name: value.name, message: value.message };
    if (Array.isArray(value))
        return value.map((v) => redact(v, depth + 1));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1),
    ]));
}
function write(level, message, meta) {
    const safe = meta ? redact(meta) : undefined;
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    if (isProd) {
        out(JSON.stringify({ level, time: new Date().toISOString(), message, ...safe }));
    }
    else {
        const tail = safe && Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
        out(`${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${message}${tail}`);
    }
}
export const logger = {
    debug: (m, meta) => !isProd && write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
};
//# sourceMappingURL=logger.js.map