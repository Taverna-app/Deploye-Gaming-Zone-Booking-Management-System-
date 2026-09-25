export const isSuperAdmin = (role) => role === 'SUPER_ADMIN';
export const isStoreRole = (role) => role === 'STORE_ADMIN' || role === 'STAFF';
/** Roles that are scoped to one or more tenants. */
export const TENANT_ROLES = ['STORE_ADMIN', 'STAFF'];
//# sourceMappingURL=permissions.js.map