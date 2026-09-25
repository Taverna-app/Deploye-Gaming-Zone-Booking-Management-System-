const PLACEHOLDER_SECRET = /change[-_ ]?me|dev-memory|test-secret|example|your[-_ ]?secret|password|secret-secret|0123456789|abcdef/i;
const isLocalUrl = (url) => /^(?:[a-z+]+:\/\/)?(?:[^@/]*@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(url);
export function productionProblems(c) {
    const errors = [];
    const warnings = [];
    if (c.NODE_ENV !== 'production')
        return { errors, warnings };
    const distinct = new Set(c.JWT_SECRET).size;
    if (PLACEHOLDER_SECRET.test(c.JWT_SECRET) || distinct < 12) {
        errors.push('JWT_SECRET looks like a placeholder or is not random enough. Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    }
    if (!c.FRONTEND_URL.startsWith('https://'))
        errors.push('FRONTEND_URL must be an https:// address in production (it is the only origin allowed to call the API).');
    if (c.DISABLE_RATE_LIMIT === 'true')
        warnings.push('DISABLE_RATE_LIMIT is set. It is ignored in production: rate limits stay on.');
    if (isLocalUrl(c.MONGODB_URI))
        warnings.push('MONGODB_URI points at a database on this machine. Use a managed database (for example MongoDB Atlas) in production.');
    if (!c.MONGODB_URI.startsWith('mongodb+srv://') && !isLocalUrl(c.MONGODB_URI) && !/[?&]tls=true|ssl=true/i.test(c.MONGODB_URI))
        warnings.push('MONGODB_URI does not ask for TLS. Atlas connection strings (mongodb+srv://) always do.');
    if (c.STORAGE_DRIVER === 'local')
        warnings.push('STORAGE_DRIVER=local keeps payment proofs on this server\'s disk. On a host with an ephemeral disk they are lost on every deploy: use STORAGE_DRIVER=s3.');
    if (c.PAYMENT_PROVIDER === 'mock')
        warnings.push('PAYMENT_PROVIDER=mock is the demo gateway: online payments succeed without moving any real money.');
    if (!(c.SMTP_USER && c.SMTP_PASSWORD))
        warnings.push('SMTP is not configured: no emails (confirmations, reminders, invitations, password resets) will be sent.');
    if (!c.SCHEDULER_ENABLED && !c.CRON_SECRET)
        warnings.push('The in-process scheduler is off and CRON_SECRET is not set: nothing will send reminders or expire unpaid bookings.');
    return { errors, warnings };
}
//# sourceMappingURL=productionChecks.js.map