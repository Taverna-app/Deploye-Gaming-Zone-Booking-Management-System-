import { Business, BusinessSettings } from '../models/index.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { audit } from './audit.service.js';
import { getEffectiveSettings } from './availability.service.js';
const PROFILE_FIELDS = ['name', 'description', 'phone', 'whatsapp', 'email', 'address', 'city', 'country', 'openingTime', 'closingTime'];
const BOOKING_FIELDS = [
    'minimumBookingMinutes',
    'maximumBookingMinutes',
    'slotIntervalMinutes',
    'advanceBookingDays',
    'cancellationMinutes',
    'allowCancellation',
    'allowRescheduling',
    'allowWalkIn',
    'allowPayAtVenue',
    'allowBankTransfer',
    'enableEmailNotifications',
    'enableWhatsAppNotifications',
    'paymentHoldMinutes',
    'noShowGraceMinutes',
    'taxPercent',
    'terms',
    'cancellationPolicy',
];
const BANK_FIELDS = ['bankName', 'accountTitle', 'accountNumber', 'iban', 'instructions'];
const pick = (source, keys) => Object.fromEntries(keys.map((k) => [k, source?.[k]]));
function definedOnly(obj) {
    return Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined));
}
/**
 * Everything a store admin may change about their own store. Slug, booking prefix, timezone, currency, status and
 * subscription are platform-controlled (they appear in URLs, booking numbers and existing bookings), so they are
 * returned read-only and never accepted here.
 */
export async function getStoreSettings(businessId) {
    const [business, settings] = await Promise.all([Business.findById(businessId).lean(), getEffectiveSettings(businessId)]);
    if (!business)
        throw new NotFoundError('Store not found');
    return {
        profile: pick(business, PROFILE_FIELDS),
        booking: pick(settings, BOOKING_FIELDS),
        bankDetails: pick(business.bankDetails, BANK_FIELDS),
        /** The store's public pictures. They are changed by uploading (see media.service), not through the settings form. */
        media: { logo: business.logo ?? null, coverImage: business.coverImage ?? null },
        fixed: {
            slug: business.slug,
            bookingPrefix: business.bookingPrefix,
            timezone: business.timezone,
            currency: business.currency,
            status: business.status,
            subscriptionStatus: business.subscriptionStatus,
        },
    };
}
export async function updateStoreSettings(businessId, input, req) {
    const current = await getStoreSettings(businessId);
    const profileChanges = definedOnly(input.profile);
    const bookingChanges = definedOnly(input.booking);
    const bankChanges = definedOnly(input.bankDetails);
    const profile = { ...current.profile, ...profileChanges };
    const booking = { ...current.booking, ...bookingChanges };
    const bank = { ...current.bankDetails, ...bankChanges };
    const problems = [];
    const step = booking.slotIntervalMinutes;
    if (booking.minimumBookingMinutes > booking.maximumBookingMinutes)
        problems.push({ path: 'booking.maximumBookingMinutes', message: 'The longest booking cannot be shorter than the shortest' });
    if (booking.minimumBookingMinutes % step !== 0)
        problems.push({ path: 'booking.minimumBookingMinutes', message: `The shortest booking must be a multiple of the ${step}-minute slot` });
    if (booking.maximumBookingMinutes % step !== 0)
        problems.push({ path: 'booking.maximumBookingMinutes', message: `The longest booking must be a multiple of the ${step}-minute slot` });
    // Customers who choose a bank transfer must be told where to send the money.
    const bankTouched = bookingChanges.allowBankTransfer === true || Object.keys(bankChanges).length > 0;
    if (bankTouched && booking.allowBankTransfer && !bank.accountNumber && !bank.iban) {
        problems.push({ path: 'bankDetails.accountNumber', message: 'Add an account number or IBAN before accepting bank transfers' });
    }
    if (problems.length)
        throw new ValidationError('Invalid settings', problems);
    const set = {};
    const unset = {};
    for (const [k, v] of Object.entries(profileChanges)) {
        if (v === '')
            unset[k] = '';
        else
            set[k] = v;
    }
    for (const [k, v] of Object.entries(bankChanges)) {
        if (v === '')
            unset[`bankDetails.${k}`] = '';
        else
            set[`bankDetails.${k}`] = v;
    }
    if (Object.keys(set).length || Object.keys(unset).length) {
        await Business.updateOne({ _id: businessId }, { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) }, { runValidators: true });
    }
    if (Object.keys(bookingChanges).length) {
        await BusinessSettings.updateOne({ businessId }, { $set: bookingChanges }, { upsert: true, runValidators: true });
    }
    await audit({
        action: 'STORE_SETTINGS_UPDATED',
        entity: 'Business',
        entityId: businessId,
        businessId,
        req,
        // Field names only: bank details and contact data never go into the audit log.
        metadata: { profile: Object.keys(profileChanges), booking: Object.keys(bookingChanges), bankDetails: Object.keys(bankChanges) },
    });
    return getStoreSettings(businessId);
}
//# sourceMappingURL=storeSettings.service.js.map