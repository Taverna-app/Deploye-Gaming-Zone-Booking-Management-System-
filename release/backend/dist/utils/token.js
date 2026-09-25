import crypto from 'node:crypto';
/** Opaque random token for emailed links. Only the hash is stored in the DB. */
export function generateOpaqueToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, tokenHash: hashToken(token) };
}
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
//# sourceMappingURL=token.js.map