import { DateTime } from 'luxon';
import { Booking, Business } from '../models/index.js';
import { env } from '../config/env.js';
import { NotFoundError } from '../utils/errors.js';
import { getEffectiveSettings } from '../services/availability.service.js';
import { customerToStoreMessage, whatsappLink, storeToCustomerMessage } from '../services/whatsapp.service.js';
import { PLATFORM_BRAND } from '../templates/emails/layout.js';
const METHOD_LABEL = { PAY_AT_VENUE: 'Pay at venue', BANK_TRANSFER: 'Bank transfer', ONLINE: 'Online payment' };
const humanize = (s) => s.toLowerCase().replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
const time12 = (hhmm) => DateTime.fromFormat(hhmm, 'HH:mm').toFormat('h:mm a');
const durationLabel = (m) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? (r ? `${h} hr ${r} min` : h === 1 ? '1 hr' : `${h} hrs`) : `${r} min`;
};
/** Loads a booking with everything needed to describe it to a person, formatted in the store's timezone/currency. */
export async function loadBookingContext(bookingId) {
    const b = await Booking.findById(bookingId)
        .populate('stationId', 'code name')
        .populate('categoryId', 'name')
        .populate('customerId', 'name email phone isActive isWalkIn')
        .lean();
    if (!b)
        throw new NotFoundError('Booking not found');
    const business = await Business.findById(b.businessId).select('name slug timezone currency address city whatsapp logo branding').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const settings = await getEffectiveSettings(business._id);
    const station = b.stationId;
    const category = b.categoryId;
    const cust = b.customerId;
    const brand = { name: business.name, primaryColor: business.branding?.primaryColor ?? PLATFORM_BRAND.primaryColor, logoUrl: business.logo ?? undefined };
    const facts = {
        storeName: business.name,
        customerName: cust.name,
        bookingNumber: b.bookingNumber,
        station: station.code,
        date: DateTime.fromFormat(b.bookingDate, 'yyyy-MM-dd').toFormat('ccc d LLL'),
        time: `${time12(b.startTime)} - ${time12(b.endTime)}`,
    };
    const toStoreLink = whatsappLink(business.whatsapp, customerToStoreMessage(facts));
    return {
        bookingId: String(b._id),
        businessId: String(business._id),
        customer: { id: String(cust._id), name: cust.name, email: cust.email, phone: cust.phone, isActive: cust.isActive, isWalkIn: Boolean(cust.isWalkIn) },
        emailEnabled: settings.enableEmailNotifications,
        whatsappEnabled: settings.enableWhatsAppNotifications,
        toStoreLink,
        toCustomerLink: (kind) => whatsappLink(cust.phone, storeToCustomerMessage(kind, facts)),
        facts,
        email: {
            brand,
            customerName: cust.name,
            bookingNumber: b.bookingNumber,
            storeName: business.name,
            station: station.code,
            category: category.name,
            date: DateTime.fromFormat(b.bookingDate, 'yyyy-MM-dd').toFormat('cccc, d LLLL yyyy'),
            time: `${time12(b.startTime)} - ${time12(b.endTime)}`,
            duration: durationLabel(b.durationMinutes),
            players: b.numberOfPlayers,
            total: new Intl.NumberFormat('en-PK', { style: 'currency', currency: business.currency, minimumFractionDigits: Number.isInteger(b.totalAmount) ? 0 : 2 }).format(b.totalAmount),
            paymentMethod: METHOD_LABEL[b.paymentMethod] ?? humanize(b.paymentMethod),
            paymentStatus: humanize(b.paymentStatus),
            address: [business.address, business.city].filter(Boolean).join(', ') || undefined,
            bookingUrl: `${env.FRONTEND_URL}/dashboard/bookings/${b.bookingNumber}`,
            whatsappUrl: toStoreLink ?? undefined,
        },
    };
}
//# sourceMappingURL=bookingContext.js.map