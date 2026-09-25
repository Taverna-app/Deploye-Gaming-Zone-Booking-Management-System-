import bcrypt from 'bcryptjs';
// Low cost in tests only, to keep the suite fast.
const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;
// Compared against when the user does not exist so login timing does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS);
export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash ?? DUMMY_HASH).then((ok) => ok && Boolean(hash));
//# sourceMappingURL=password.js.map