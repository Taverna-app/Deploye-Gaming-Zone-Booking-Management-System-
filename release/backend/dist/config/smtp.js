import nodemailer from 'nodemailer';
import { env, smtpConfigured } from './env.js';
import { logger } from '../utils/logger.js';
let transporter = null;
export function getTransporter() {
    if (!smtpConfigured)
        return null;
    transporter ??= nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    return transporter;
}
export async function checkSmtp() {
    const t = getTransporter();
    if (!t)
        return 'DISCONNECTED';
    try {
        await t.verify();
        return 'CONNECTED';
    }
    catch (err) {
        logger.warn('SMTP verification failed', { error: err.message });
        return 'ERROR';
    }
}
//# sourceMappingURL=smtp.js.map