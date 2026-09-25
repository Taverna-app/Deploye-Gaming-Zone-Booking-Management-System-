import 'dotenv/config';
import { z } from 'zod';
const bool = z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true');
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    MONGODB_DB: z.string().default('gamingzonedb'),
    MONGODB_DNS_SERVERS: z.string().optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM_NAME: z.string().default('Zobix Solutions'),
    /** Comma-separated domains that never receive mail (e.g. the seeded demo accounts), so reminders to fake addresses do not burn the SMTP daily quota. */
    EMAIL_SUPPRESS_DOMAINS: z
        .string()
        .default('')
        .transform((v) => v.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)),
    WHATSAPP_NUMBER: z.string().optional(),
    UPLOAD_DIR: z.string().default('uploads'),
    /** Where uploaded files live. Only "local" today; the storage service is the seam for Cloudinary / S3 / Vercel Blob. */
    STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
    /** Cloudinary as private file storage. Used when STORAGE_DRIVER=cloudinary. Server side only: never put these in the frontend. */
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    /** S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO). Used when STORAGE_DRIVER=s3. */
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    /** Leave empty for AWS S3; set the provider's endpoint URL for the others. */
    S3_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** Some providers (MinIO, older Ceph) need "bucket in the path" instead of "bucket in the host name". */
    S3_FORCE_PATH_STYLE: bool,
    MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(5),
    /** Online payment gateway. "mock" is a demo provider that needs no external account. */
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    /** Run the in-process scheduler (reminders, cleanup, no-shows). Turn off where a platform cron calls /api/cron/* instead. */
    SCHEDULER_ENABLED: z
        .enum(['true', 'false'])
        .default('true')
        .transform((v) => v === 'true'),
    /** Shared secret for /api/cron/:job (e.g. Vercel Cron). The endpoint does not exist when unset. */
    CRON_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional()),
});
const parsed = schema
    .refine((v) => v.STORAGE_DRIVER !== 'cloudinary' || (v.CLOUDINARY_CLOUD_NAME && v.CLOUDINARY_API_KEY && v.CLOUDINARY_API_SECRET), {
    path: ['CLOUDINARY_CLOUD_NAME'],
    message: 'STORAGE_DRIVER=cloudinary needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
})
    .refine((v) => v.STORAGE_DRIVER !== 's3' || (v.S3_BUCKET && v.S3_ACCESS_KEY_ID && v.S3_SECRET_ACCESS_KEY), {
    path: ['S3_BUCKET'],
    message: 'STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
})
    .safeParse(process.env);
if (!parsed.success) {
    // Print variable names only - never values.
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const smtpConfigured = Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
//# sourceMappingURL=env.js.map