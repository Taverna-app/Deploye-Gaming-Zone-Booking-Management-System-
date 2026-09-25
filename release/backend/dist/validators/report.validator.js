import { z } from 'zod';
import { DateTime } from 'luxon';
import { localDateString } from './common.validator.js';
export const MAX_REPORT_DAYS = 366;
const range = z
    .object({
    /** Business days, inclusive. Both omitted = the last 30 days. */
    from: localDateString.optional(),
    to: localDateString.optional(),
})
    .superRefine((v, ctx) => {
    if ((v.from === undefined) !== (v.to === undefined)) {
        ctx.addIssue({ code: 'custom', path: [v.from ? 'to' : 'from'], message: 'Give both a start and an end date, or neither' });
        return;
    }
    if (!v.from || !v.to)
        return;
    if (v.to < v.from)
        ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date cannot be before the start date' });
    const days = DateTime.fromFormat(v.to, 'yyyy-MM-dd').diff(DateTime.fromFormat(v.from, 'yyyy-MM-dd'), 'days').days + 1;
    if (days > MAX_REPORT_DAYS)
        ctx.addIssue({ code: 'custom', path: ['to'], message: `A report can cover at most ${MAX_REPORT_DAYS} days` });
});
export const reportQuerySchema = range;
export const EXPORT_KINDS = ['bookings', 'payments', 'customers', 'revenue'];
export const exportParamsSchema = z.object({ kind: z.enum(EXPORT_KINDS) });
//# sourceMappingURL=report.validator.js.map