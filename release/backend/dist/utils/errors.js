export class AppError extends Error {
    statusCode;
    code;
    errors;
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', errors = []) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.errors = errors;
        this.name = new.target.name;
    }
}
export class ValidationError extends AppError {
    constructor(message = 'Validation failed', errors = []) {
        super(message, 400, 'VALIDATION_ERROR', errors);
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super(message, 403, 'FORBIDDEN');
    }
}
export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
    }
}
export class ConflictError extends AppError {
    constructor(message = 'Conflict', code = 'CONFLICT') {
        super(message, 409, code);
    }
}
export class TooManyRequestsError extends AppError {
    retryAfterSeconds;
    constructor(message = 'Too many requests', retryAfterSeconds) {
        super(message, 429, 'RATE_LIMITED');
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
export class BookingUnavailableError extends ConflictError {
    constructor(message = 'Sorry, this station was just booked by another customer.') {
        super(message, 'BOOKING_UNAVAILABLE');
    }
}
export class PricingError extends AppError {
    constructor(message = 'Pricing could not be calculated') {
        super(message, 422, 'PRICING_ERROR');
    }
}
/** The category has no published rate: the customer has to ask the store, so there is nothing to quote or book online. */
export const PRICE_ON_REQUEST_MESSAGE = 'Pricing unavailable. Please contact the gaming zone to confirm the rate before booking.';
export class PriceOnRequestError extends AppError {
    constructor(message = PRICE_ON_REQUEST_MESSAGE) {
        super(message, 409, 'PRICE_ON_REQUEST');
    }
}
export class PaymentError extends AppError {
    constructor(message = 'Payment failed') {
        super(message, 402, 'PAYMENT_ERROR');
    }
}
//# sourceMappingURL=errors.js.map