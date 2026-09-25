/**
 * Money is kept as plain numbers rounded to 2 decimals at every step that is persisted or shown.
 * (Amounts here are whole-currency scale - PKR - so float drift is not a concern once rounded.)
 */
export const roundMoney = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
//# sourceMappingURL=currency.js.map