import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { PaymentError } from '../utils/errors.js';
/**
 * Demo gateway: no network, no money. "Checkout" succeeds unless the caller asks it to fail, which is enough to
 * exercise every branch of the payment flow in development and demos.
 */
class MockPaymentProvider {
    name = 'mock';
    simulated = true;
    async createPayment(input) {
        return { reference: `mock_${randomUUID()}`, checkoutUrl: `/pay/${input.paymentId}` };
    }
    async verifyPayment(reference, hint) {
        if (!reference.startsWith('mock_'))
            return { status: 'FAILED' };
        return { status: hint?.outcome === 'failure' ? 'FAILED' : 'PAID' };
    }
    async refundPayment(reference) {
        if (!reference.startsWith('mock_'))
            return { status: 'FAILED', refundReference: '' };
        return { status: 'REFUNDED', refundReference: `mock_refund_${randomUUID()}` };
    }
}
const providers = { mock: new MockPaymentProvider() };
export function getPaymentProvider() {
    const provider = providers[env.PAYMENT_PROVIDER];
    if (!provider)
        throw new PaymentError('No payment provider is configured');
    return provider;
}
//# sourceMappingURL=payment.provider.js.map