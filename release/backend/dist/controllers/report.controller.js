import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { safeFileName } from '../utils/csv.js';
import { getTenantId } from '../middleware/tenant.middleware.js';
import { audit } from '../services/audit.service.js';
import * as reports from '../services/report.service.js';
export const report = asyncHandler(async (req, res) => {
    ok(res, await reports.getReport(getTenantId(req), req.validatedQuery));
});
export const exportReport = asyncHandler(async (req, res) => {
    const businessId = getTenantId(req);
    const kind = req.params.kind;
    const file = await reports.exportCsv(businessId, kind, req.validatedQuery);
    // Exports carry customer contact details, so each one is recorded.
    await audit({ action: 'REPORT_EXPORTED', entity: 'Report', businessId, req, metadata: { kind, from: file.from, to: file.to, rows: file.rows } });
    res
        .status(200)
        .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFileName(file.filename)}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    })
        .send(file.csv);
});
//# sourceMappingURL=report.controller.js.map