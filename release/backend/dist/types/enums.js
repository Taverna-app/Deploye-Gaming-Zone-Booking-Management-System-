const values = (v) => v;
export const ROLES = values(['SUPER_ADMIN', 'STORE_ADMIN', 'STAFF', 'CUSTOMER']);
export const BUSINESS_STATUS = values(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const SUBSCRIPTION_STATUS = values(['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED']);
export const STATION_STATUS = values(['AVAILABLE', 'BOOKED', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE']);
export const BOOKING_STATUS = values([
    'PENDING',
    'CONFIRMED',
    'CHECKED_IN',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
]);
/** Statuses that occupy a station's time slot. CANCELLED / NO_SHOW / COMPLETED do not block. */
export const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
export const PAYMENT_METHOD = values(['PAY_AT_VENUE', 'BANK_TRANSFER', 'ONLINE']);
export const PAYMENT_STATUS = values(['PENDING', 'PAID', 'PARTIAL', 'FAILED', 'REFUNDED', 'REJECTED']);
export const PRICING_RULE_TYPE = values(['NORMAL', 'PEAK', 'WEEKEND', 'SPECIAL_DATE']);
export const DISCOUNT_TYPE = values(['PERCENTAGE', 'FIXED']);
export const NOTIFICATION_CHANNEL = values(['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS']);
export const NOTIFICATION_STATUS = values(['PENDING', 'SENT', 'FAILED', 'READ']);
export const NOTIFICATION_TYPE = values([
    'BOOKING_CREATED',
    'BOOKING_CONFIRMED',
    'BOOKING_CANCELLED',
    'BOOKING_RESCHEDULED',
    'BOOKING_REMINDER',
    'PAYMENT_RECEIVED',
    'PAYMENT_PENDING',
    'PAYMENT_FAILED',
    'SESSION_STARTED',
    'SESSION_COMPLETED',
    'STORE_CREATED',
    'STAFF_INVITED',
    'REVIEW_RECEIVED',
    'PASSWORD_RESET',
    'SYSTEM_ALERT',
]);
export const REVIEW_STATUS = values(['PENDING', 'APPROVED', 'REJECTED']);
export const INVITATION_STATUS = values(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);
export const REMINDER_KINDS = values(['24H', '2H', '30M']);
//# sourceMappingURL=enums.js.map