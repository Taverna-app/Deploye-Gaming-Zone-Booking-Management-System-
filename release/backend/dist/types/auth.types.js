export const actorFrom = (req) => ({
    id: req.user.id,
    role: req.user.role,
    businessIds: req.user.businessIds,
    businessId: req.tenantId,
});
//# sourceMappingURL=auth.types.js.map