import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';
export function signAccessToken(payload, expiresIn = env.JWT_EXPIRES_IN) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn, algorithm: 'HS256' });
}
export function verifyAccessToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
        if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.tv !== 'number') {
            throw new UnauthorizedError('Invalid token');
        }
        return { sub: decoded.sub, tv: decoded.tv, imp: typeof decoded.imp === 'string' ? decoded.imp : undefined };
    }
    catch (err) {
        if (err instanceof UnauthorizedError)
            throw err;
        throw new UnauthorizedError('Invalid or expired token');
    }
}
//# sourceMappingURL=jwt.js.map