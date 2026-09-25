import { getTransporter } from '../config/smtp.js';
import { env, isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { loadBookingContext } from '../helpers/bookingContext.js';
import * as tpl from '../templates/emails/index.js';
import { PLATFORM_BRAND } from '../templates/emails/layout.js';
/**
 * Emails to addresses that cannot receive mail (desk-created walk-in customers, and any domain listed in
 * EMAIL_SUPPRESS_DOMAINS such as the seeded demo accounts) are skipped, not "failed".
 */
export const isDeliverable = (email) => {
    const address = email.toLowerCase();
    return !address.endsWith('@walkin.invalid') && !env.EMAIL_SUPPRESS_DOMAINS.some((d) => address.endsWith(`@${d}`));
};
/**
 * Hands a message to the SMTP server. Returns true when accepted. Never throws: an email problem must not fail the
 * request that triggered it. Without SMTP credentials (development) nothing is sent.
 */
export async function sendEmail({ to, subject, html, text }) {
    if (!isDeliverable(to))
        return false;
    const transporter = getTransporter();
    if (!transporter) {
        logger.warn('SMTP not configured; email skipped', { subject });
        return false;
    }
    try {
        await transporter.sendMail({ from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_USER}>`, to, subject, html, text });
        return true;
    }
    catch (err) {
        logger.error('Failed to send email', { subject, error: err.message });
        return false;
    }
}
const deliver = (to, mail) => sendEmail({ to, ...mail });
/* ------------------------------------------------------------------ accounts */
const devLink = (label, link) => {
    if (!isProd && !getTransporter())
        logger.info(`DEV ${label} (SMTP not configured)`, { link });
};
export function sendWelcomeEmail(to, name) {
    return deliver(to, tpl.welcome({ name, url: env.FRONTEND_URL }));
}
export function sendEmailVerificationEmail(to, name, token) {
    const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
    devLink('email verification link', url);
    return deliver(to, tpl.emailVerification({ name, url }));
}
export function sendPasswordResetEmail(to, name, token) {
    const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    devLink('password reset link', url);
    return deliver(to, tpl.passwordReset({ name, url }));
}
export function sendStaffInvitationEmail(p) {
    const url = `${env.FRONTEND_URL}/reset-password?token=${p.token}`;
    devLink('staff invitation link', url);
    return deliver(p.to, tpl.staffInvitation({ brand: p.brand ?? PLATFORM_BRAND, inviteeName: p.inviteeName, storeName: p.storeName, inviterName: p.inviterName, role: p.role, url }));
}
export function sendStoreRegistrationEmail({ to, ownerName, businessName, inviteToken, existingAccount }) {
    const mode = existingAccount ? 'existing' : inviteToken ? 'invite' : 'temp';
    const url = inviteToken && !existingAccount ? `${env.FRONTEND_URL}/reset-password?token=${inviteToken}` : `${env.FRONTEND_URL}/login`;
    if (inviteToken)
        devLink('store invitation link', url);
    return deliver(to, tpl.storeCreated({ ownerName, businessName, mode, url }));
}
const BUILDERS = {
    CREATED: tpl.bookingCreated,
    CONFIRMED: tpl.bookingConfirmed,
    CANCELLED: tpl.bookingCancelled,
    RESCHEDULED: tpl.bookingRescheduled,
    PAYMENT_RECEIVED: tpl.paymentReceived,
    PAYMENT_PENDING: tpl.paymentPending,
    PAYMENT_FAILED: tpl.paymentFailed,
};
/**
 * Emails the customer about a booking, honouring the store's notification switch. The template is chosen by `kind`;
 * `detail` adds one sentence (a reason, an overtime note, ...). Reminders pass `leadLabel`.
 */
export async function sendBookingEmail(bookingId, kind, opts = {}) {
    if (!getTransporter())
        return { status: 'SKIPPED' }; // no SMTP configured: nothing to attempt or log as failed
    const ctx = await loadBookingContext(bookingId);
    if (!ctx.emailEnabled || !ctx.customer.isActive || !isDeliverable(ctx.customer.email))
        return { status: 'SKIPPED' };
    const data = { ...ctx.email, detail: opts.detail };
    const mail = kind === 'REMINDER' ? tpl.bookingReminder({ ...data, leadLabel: opts.leadLabel ?? 'a while' }) : BUILDERS[kind](data);
    const ok = await deliver(ctx.customer.email, mail);
    return { status: ok ? 'SENT' : 'FAILED', subject: mail.subject };
}
export const sendBookingConfirmationEmail = (bookingId, detail) => sendBookingEmail(bookingId, 'CONFIRMED', { detail });
export const sendBookingCancellationEmail = (bookingId, detail) => sendBookingEmail(bookingId, 'CANCELLED', { detail });
export const sendBookingReminderEmail = (bookingId, leadLabel) => sendBookingEmail(bookingId, 'REMINDER', { leadLabel });
export const sendPaymentConfirmationEmail = (bookingId, detail) => sendBookingEmail(bookingId, 'PAYMENT_RECEIVED', { detail });
//# sourceMappingURL=email.service.js.map