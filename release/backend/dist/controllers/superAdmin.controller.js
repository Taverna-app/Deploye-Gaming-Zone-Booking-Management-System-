import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated } from '../utils/response.js';
import * as businessService from '../services/business.service.js';
import * as superAdminService from '../services/superAdmin.service.js';
import * as platformReports from '../services/platformReport.service.js';
import { audit } from '../services/audit.service.js';
import { safeFileName } from '../utils/csv.js';
const query = (req) => req.validatedQuery;
/* dashboard */
export const dashboard = asyncHandler(async (req, res) => {
    ok(res, await superAdminService.getDashboard(query(req)));
});
/* platform reports */
export const platformReport = asyncHandler(async (req, res) => {
    ok(res, await platformReports.getPlatformReport(query(req)));
});
export const exportPlatformReport = asyncHandler(async (req, res) => {
    const file = await platformReports.exportPlatformReport(query(req));
    await audit({ action: 'REPORT_EXPORTED', entity: 'Report', req, metadata: { kind: 'platform', from: file.from, to: file.to, rows: file.rows } });
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
/* businesses */
export const listBusinesses = asyncHandler(async (req, res) => {
    const { data, pagination } = await businessService.listBusinesses(query(req));
    paginated(res, data, pagination);
});
export const createBusiness = asyncHandler(async (req, res) => {
    created(res, await businessService.createBusiness(req.body, { id: req.user.id }, req), 'Business created');
});
export const getBusiness = asyncHandler(async (req, res) => {
    ok(res, await businessService.getBusiness(req.params.id));
});
export const updateBusiness = asyncHandler(async (req, res) => {
    ok(res, await businessService.updateBusiness(req.params.id, req.body, req), 'Business updated');
});
const statusAction = (status, message) => asyncHandler(async (req, res) => {
    ok(res, await businessService.setBusinessStatus(req.params.id, status, req), message);
});
export const activateBusiness = statusAction('ACTIVE', 'Business activated');
export const deactivateBusiness = statusAction('INACTIVE', 'Business deactivated');
export const suspendBusiness = statusAction('SUSPENDED', 'Business suspended');
export const impersonate = asyncHandler(async (req, res) => {
    ok(res, await businessService.impersonateStoreAdmin(req.params.id, req.body, { id: req.user.id }, req), 'Impersonation started');
});
/* users, audit logs, settings */
export const listUsers = asyncHandler(async (req, res) => {
    const { data, pagination } = await superAdminService.listUsers(query(req));
    paginated(res, data, pagination);
});
export const listAuditLogs = asyncHandler(async (req, res) => {
    const { data, pagination } = await superAdminService.listAuditLogs(query(req));
    paginated(res, data, pagination);
});
export const getSettings = asyncHandler(async (_req, res) => {
    ok(res, await superAdminService.getSettings());
});
export const updateSettings = asyncHandler(async (req, res) => {
    ok(res, await superAdminService.updateSettings(req.body), 'Settings updated');
});
export const systemHealth = asyncHandler(async (_req, res) => {
    ok(res, await superAdminService.getSystemHealth());
});
//# sourceMappingURL=superAdmin.controller.js.map