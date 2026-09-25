import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema, } from '../validators/auth.validator.js';
export const authRouter = Router();
authRouter.post('/register', authLimiter, validate(registerSchema), controller.register);
authRouter.post('/login', authLimiter, validate(loginSchema), controller.login);
authRouter.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate(resetPasswordSchema), controller.resetPassword);
authRouter.post('/logout', authenticate, controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post('/change-password', authenticate, validate(changePasswordSchema), controller.changePassword);
authRouter.post('/end-impersonation', authenticate, controller.endImpersonation);
authRouter.post('/verify-email', authLimiter, validate(verifyEmailSchema), controller.verifyEmail);
authRouter.post('/resend-verification', authLimiter, authenticate, controller.resendVerification);
//# sourceMappingURL=auth.routes.js.map