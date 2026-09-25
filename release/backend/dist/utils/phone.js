/**
 * Canonical phone form: digits with an optional leading "+", no spaces/dashes/brackets. Used wherever a phone is
 * stored or compared, so "+92 300-1234567" and "+923001234567" are recognised as the same customer.
 */
export function normalizePhone(input) {
    const trimmed = input.trim();
    const digits = trimmed.replace(/\D/g, '');
    return trimmed.startsWith('+') ? `+${digits}` : digits;
}
//# sourceMappingURL=phone.js.map