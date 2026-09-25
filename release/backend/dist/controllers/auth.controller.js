import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';
import { audit } from '../services/audit.service.js';
import * as authService from '../services/auth.service.js';
export const register = asyncHandler(async (req, res) => {
    created(res, await authService.register(req.body), 'Account created');
});
export const login = asyncHandler(async (req, res) => {
    ok(res, await authService.login(req.body, req), 'Logged in');
});
export const logout = asyncHandler(async (req, res) => {
    await audit({ action: 'LOGOUT', entity: 'User', entityId: req.user.id, req });
    ok(res, null, 'Logged out');
});
export const me = asyncHandler(async (req, res) => {
    ok(res, await authService.getProfile(req.user.id, req.user.impersonatedBy));
});
export const forgotPassword = asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    ok(res, null, 'If that email is registered, a reset link has been sent');
});
export const resetPassword = asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    ok(res, null, 'Password updated. Please log in.');
});
export const changePassword = asyncHandler(async (req, res) => {
    ok(res, await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword), 'Password changed');
});
export const endImpersonation = asyncHandler(async (req, res) => {
    if (!req.user.impersonatedBy)
        throw new ValidationError('Not an impersonation session');
    ok(res, await authService.endImpersonation(req.user.impersonatedBy, req.user.id, req), 'Returned to Super Admin');
});
export const verifyEmail = asyncHandler(async (req, res) => {
    ok(res, await authService.verifyEmail(req.body.token), 'Email verified');
});
export const resendVerification = asyncHandler(async (req, res) => {
    ok(res, await authService.resendVerification(req.user.id), 'Verification email sent');
});
//# sourceMappingURL=auth.controller.js.map