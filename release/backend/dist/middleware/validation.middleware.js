/**
 * Validates a request part with Zod. Parsed (and stripped) data replaces req.body / req.params;
 * for query it is exposed as req.validatedQuery because req.query is read-only in Express 5.
 * Errors flow to the central error middleware as ZodError -> 400.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success)
        return next(result.error);
    if (source === 'query')
        req.validatedQuery = result.data;
    else
        req[source] = result.data;
    next();
};
//# sourceMappingURL=validation.middleware.js.map