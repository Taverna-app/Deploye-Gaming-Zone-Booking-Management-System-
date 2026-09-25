import mongoose from 'mongoose';
/**
 * Runs `fn` in a MongoDB transaction, retrying the WHOLE callback when the server reports a transient
 * error (e.g. a write conflict with a concurrent booking). Because of that:
 *   - `fn` must not send emails / emit events / do anything non-repeatable; do that after this returns.
 *   - Throw an AppError from `fn` to abort and surface it (it is not retried).
 * Requires a replica set (Atlas, or a local single-node replica set).
 */
export async function runInTransaction(fn) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await fn(session);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        return result;
    }
    finally {
        await session.endSession();
    }
}
//# sourceMappingURL=transaction.js.map