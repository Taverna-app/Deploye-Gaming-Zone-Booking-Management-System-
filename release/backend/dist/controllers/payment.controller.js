import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';
import { actorFrom } from '../types/auth.types.js';
import * as service from '../services/payment.service.js';
const id = (req) => req.params.id;
/* ---- customer ---- */
export const submitProof = asyncHandler(async (req, res) => {
    ok(res, await service.submitProof(id(req), req.file, req.body, actorFrom(req), req), 'Payment proof submitted');
});
export const paymentInfo = asyncHandler(async (req, res) => {
    ok(res, await service.getPaymentInfo(req.params.slug));
});
export const startOnline = asyncHandler(async (req, res) => {
    ok(res, await service.startOnlinePayment(id(req), actorFrom(req)));
});
export const verifyOnline = asyncHandler(async (req, res) => {
    ok(res, await service.verifyOnlinePayment(id(req), req.body, actorFrom(req), req));
});
/* ---- proof file (owner, the store's staff, super admin) ---- */
export const getProof = asyncHandler(async (req, res) => {
    const { data, mime, filename } = await service.getProof(id(req), actorFrom(req));
    res
        .set({
        'Content-Type': mime,
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename="${filename}"`,
        // The bytes were verified as an image/PDF at upload; still forbid content sniffing and any caching by proxies.
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
    })
        .send(data);
});
export const getProofLink = asyncHandler(async (req, res) => {
    ok(res, await service.getProofLink(id(req), actorFrom(req)));
});
/* ---- store admin / super admin ---- */
export const list = asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const { data, pagination } = await service.listPayments({ businessId: actor.businessId }, req.validatedQuery);
    paginated(res, data, pagination);
});
export const get = asyncHandler(async (req, res) => {
    ok(res, await service.getAdminPayment(id(req), actorFrom(req)));
});
export const approve = asyncHandler(async (req, res) => {
    ok(res, await service.approvePayment(id(req), actorFrom(req), req), 'Payment approved');
});
export const reject = asyncHandler(async (req, res) => {
    ok(res, await service.rejectPayment(id(req), req.body.reason, actorFrom(req), req), 'Payment rejected');
});
export const refund = asyncHandler(async (req, res) => {
    ok(res, await service.refundPayment(id(req), req.body.reason, actorFrom(req), req), 'Payment refunded');
});
/** Platform-wide list (super admin): every store, optionally narrowed with ?businessId=. */
export const listAll = asyncHandler(async (req, res) => {
    const { data, pagination } = await service.listPayments({}, req.validatedQuery);
    paginated(res, data, pagination);
});
//# sourceMappingURL=payment.controller.js.map