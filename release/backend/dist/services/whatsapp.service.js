/**
 * WhatsApp support, deep-link only for now: nothing is sent automatically; a person taps a `wa.me` link that opens
 * WhatsApp with the message pre-filled. `WhatsAppMessenger` is the seam for the WhatsApp Business API later: a real
 * provider would implement `send()` and be chosen in `getMessenger()` without touching callers.
 */
/** `https://wa.me/<digits>?text=<encoded>`, or null when there is no usable number. */
export function whatsappLink(to, text) {
    const digits = to?.replace(/\D/g, '');
    if (!digits || digits.length < 7)
        return null;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
class DeepLinkMessenger {
    name = 'deep-link';
    async send({ to, text }) {
        return { delivered: false, link: whatsappLink(to, text) ?? undefined };
    }
}
export const getMessenger = () => new DeepLinkMessenger();
/** Message text for each situation (written from the store to the customer). */
export function storeToCustomerMessage(kind, f) {
    const when = `${f.date} at ${f.time}`;
    switch (kind) {
        case 'CONFIRMATION':
            return `Hi ${f.customerName}, your booking ${f.bookingNumber} at ${f.storeName} is confirmed: ${f.station}, ${when}. See you there!`;
        case 'REMINDER':
            return `Hi ${f.customerName}, a reminder about your booking ${f.bookingNumber} at ${f.storeName}: ${f.station}, ${when}.`;
        case 'CANCELLATION':
            return `Hi ${f.customerName}, your booking ${f.bookingNumber} at ${f.storeName} (${f.station}, ${when}) has been cancelled.`;
        case 'RESCHEDULE':
            return `Hi ${f.customerName}, your booking ${f.bookingNumber} at ${f.storeName} has moved to ${f.station}, ${when}.`;
    }
}
/** A customer writing to the store about their booking. */
export const customerToStoreMessage = (f) => `Hi ${f.storeName}, this is ${f.customerName}. About my booking ${f.bookingNumber} (${f.station}, ${f.date} at ${f.time}).`;
//# sourceMappingURL=whatsapp.service.js.map