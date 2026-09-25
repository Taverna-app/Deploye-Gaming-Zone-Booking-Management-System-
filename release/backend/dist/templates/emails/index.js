import { PLATFORM_BRAND, renderEmail } from './layout.js';
const bookingRows = (d) => [
    { label: 'Booking', value: d.bookingNumber },
    { label: 'Gaming zone', value: d.storeName },
    { label: 'Station', value: `${d.station} (${d.category})` },
    { label: 'Date', value: d.date },
    { label: 'Time', value: `${d.time} (${d.duration})` },
    { label: 'Players', value: String(d.players) },
    { label: 'Total', value: d.total },
    { label: 'Payment', value: `${d.paymentMethod} - ${d.paymentStatus}` },
    ...(d.address ? [{ label: 'Address', value: d.address }] : []),
];
const view = (d) => ({ cta: { label: 'View booking', url: d.bookingUrl }, ...(d.whatsappUrl && { secondary: { label: 'Message the store on WhatsApp', url: d.whatsappUrl } }) });
const detail = (d) => (d.detail ? [d.detail] : []);
/* ------------------------------------------------------------------ bookings */
export const bookingCreated = (d) => renderEmail(d.brand, `We received your booking ${d.bookingNumber}`, {
    preheader: `Booking ${d.bookingNumber} at ${d.storeName} is waiting for payment.`,
    title: 'Booking received',
    intro: [`Hi ${d.customerName}, your slot at ${d.storeName} is held.`, 'It will be confirmed once your payment is verified.', ...detail(d)],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
export const bookingConfirmed = (d) => renderEmail(d.brand, `Booking confirmed - ${d.storeName} (${d.bookingNumber})`, {
    preheader: `You're booked at ${d.storeName} on ${d.date}, ${d.time}.`,
    title: 'Booking confirmed',
    intro: [`Hi ${d.customerName}, you're all set. See you there!`, ...detail(d)],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
export const bookingCancelled = (d) => renderEmail(d.brand, `Booking cancelled - ${d.bookingNumber}`, {
    preheader: `Booking ${d.bookingNumber} at ${d.storeName} was cancelled.`,
    title: 'Booking cancelled',
    intro: [`Hi ${d.customerName}, booking ${d.bookingNumber} at ${d.storeName} has been cancelled.`, ...detail(d)],
    rows: bookingRows(d),
    cta: { label: 'Book another session', url: d.bookingUrl },
    ...(d.whatsappUrl && { secondary: { label: 'Message the store on WhatsApp', url: d.whatsappUrl } }),
    footnote: `Sent by ${d.storeName}.`,
});
export const bookingRescheduled = (d) => renderEmail(d.brand, `Booking updated - ${d.bookingNumber}`, {
    preheader: `Your booking at ${d.storeName} now starts ${d.date}, ${d.time}.`,
    title: 'Your booking was updated',
    intro: [`Hi ${d.customerName}, the details of your booking have changed. The new details are below.`, ...detail(d)],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
export const bookingReminder = (d) => renderEmail(d.brand, `Reminder: your session at ${d.storeName} is in ${d.leadLabel}`, {
    preheader: `${d.storeName} - ${d.date}, ${d.time}`,
    title: `Your session starts in ${d.leadLabel}`,
    intro: [`Hi ${d.customerName}, just a reminder about your booking.`],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
/* ------------------------------------------------------------------ payments */
export const paymentReceived = (d) => renderEmail(d.brand, `Payment received - ${d.bookingNumber}`, {
    preheader: `We received your payment for ${d.bookingNumber}.`,
    title: 'Payment received',
    intro: [`Hi ${d.customerName}, thank you. Your payment for booking ${d.bookingNumber} was received.`, ...detail(d)],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
export const paymentPending = (d) => renderEmail(d.brand, `Payment proof received - ${d.bookingNumber}`, {
    preheader: `${d.storeName} will verify your payment shortly.`,
    title: 'We received your payment proof',
    intro: [`Hi ${d.customerName}, thanks. ${d.storeName} will verify your payment and confirm your booking.`, ...detail(d)],
    rows: bookingRows(d),
    ...view(d),
    footnote: `Sent by ${d.storeName}.`,
});
export const paymentFailed = (d) => renderEmail(d.brand, `Action needed: payment for ${d.bookingNumber}`, {
    preheader: `Your payment for ${d.bookingNumber} was not accepted.`,
    title: 'Your payment was not accepted',
    intro: [`Hi ${d.customerName}, we could not accept the payment for booking ${d.bookingNumber}.`, ...detail(d), 'Your slot is still held for now. Please try again from your booking page.'],
    rows: bookingRows(d),
    cta: { label: 'Fix payment', url: d.bookingUrl },
    ...(d.whatsappUrl && { secondary: { label: 'Message the store on WhatsApp', url: d.whatsappUrl } }),
    footnote: `Sent by ${d.storeName}.`,
});
/* ---------------------------------------------------------- accounts & staff */
export const welcome = (p) => renderEmail(PLATFORM_BRAND, 'Welcome to Zobix', {
    preheader: 'Your account is ready.',
    title: `Welcome, ${p.name}!`,
    intro: ['Your account is ready. Browse gaming zones and book your next session in seconds.'],
    cta: { label: 'Start booking', url: p.url },
});
export const emailVerification = (p) => renderEmail(PLATFORM_BRAND, 'Confirm your email address', {
    preheader: 'Confirm your email to finish setting up.',
    title: 'Confirm your email',
    intro: [`Hi ${p.name}, please confirm this is your email address. The link works for 48 hours.`],
    cta: { label: 'Confirm email', url: p.url },
    footnote: 'If you did not create an account, you can ignore this email.',
});
export const passwordReset = (p) => renderEmail(PLATFORM_BRAND, 'Reset your password', {
    preheader: 'Use this link to choose a new password.',
    title: 'Reset your password',
    intro: [`Hi ${p.name}, we received a request to reset your password. This link expires in 1 hour.`],
    cta: { label: 'Reset password', url: p.url },
    footnote: 'If you did not request this, you can ignore this email; your password will not change.',
});
export const staffInvitation = (p) => renderEmail(p.brand, `You're invited to join ${p.storeName}`, {
    preheader: `${p.inviterName} invited you to ${p.storeName}.`,
    title: `Join ${p.storeName}`,
    intro: [`Hi ${p.inviteeName}, ${p.inviterName} invited you to join ${p.storeName} as ${p.role}.`, 'Accept the invitation to set your password. The link expires in 7 days.'],
    cta: { label: 'Accept invitation', url: p.url },
    footnote: `Sent by ${p.storeName} via Zobix.`,
});
export const storeCreated = (p) => renderEmail(PLATFORM_BRAND, `${p.businessName} is ready on Zobix`, {
    preheader: `${p.businessName} has been registered.`,
    title: `Welcome to Zobix, ${p.ownerName}`,
    intro: [
        `${p.businessName} has been registered as a gaming zone on the Zobix platform. You are its store administrator.`,
        p.mode === 'invite'
            ? 'Set your password to get started (the link is valid for 7 days).'
            : p.mode === 'temp'
                ? 'Sign in with your email and the temporary password shared by Zobix Solutions, then change it.'
                : 'It has been added to your existing store-admin account.',
    ],
    cta: { label: p.mode === 'invite' ? 'Set password' : 'Sign in', url: p.url },
});
//# sourceMappingURL=index.js.map