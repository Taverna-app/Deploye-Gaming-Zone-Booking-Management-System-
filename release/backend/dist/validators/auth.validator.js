import { z } from 'zod';
export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number');
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Invalid phone number');
export const registerSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email,
    phone: phone.optional(),
    password: passwordSchema,
});
export const loginSchema = z.object({
    email,
    password: z.string().min(1).max(128),
});
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
    token: z.string().length(64),
    password: passwordSchema,
});
export const verifyEmailSchema = z.object({ token: z.string().length(64) });
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
});
//# sourceMappingURL=auth.validator.js.map