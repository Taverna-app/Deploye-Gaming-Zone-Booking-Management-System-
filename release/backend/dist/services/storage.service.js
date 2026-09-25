import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
const SAFE_KEY = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-f0-9-]{36}\.(?:jpg|png|webp|pdf)$/;
/** Every driver refuses anything that is not a server-generated key, so a request can never choose where a file goes. */
function assertSafeKey(key) {
    if (!SAFE_KEY.test(key))
        throw new Error('Invalid storage key');
}
export class LocalStorage {
    root;
    constructor(dir = env.UPLOAD_DIR) {
        this.root = path.resolve(dir);
    }
    /** Resolves a key to a path and refuses anything that would escape the root. */
    resolve(key) {
        assertSafeKey(key);
        const full = path.resolve(this.root, key);
        if (!full.startsWith(this.root + path.sep))
            throw new Error('Invalid storage key');
        return full;
    }
    async put(key, data) {
        const file = this.resolve(key);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, data, { flag: 'wx' }); // never overwrite an existing file
    }
    async get(key) {
        try {
            return await fs.readFile(this.resolve(key));
        }
        catch (err) {
            if (err.code === 'ENOENT')
                return null;
            throw err;
        }
    }
    async delete(key) {
        try {
            await fs.unlink(this.resolve(key));
        }
        catch (err) {
            if (err.code !== 'ENOENT')
                logger.warn('Could not delete stored file', { error: err.message });
        }
    }
}
/**
 * Any S3-compatible object store. Files stay PRIVATE: nothing here makes an object public or hands out a URL, they are
 * only ever read back through the API's authorized download endpoint. The SDK is loaded on first use, so a server
 * running on local disk never pays for it.
 */
export class S3Storage {
    config;
    sdk;
    constructor(config) {
        this.config = config;
    }
    load() {
        this.sdk ??= import('@aws-sdk/client-s3').then((mod) => ({
            mod,
            client: new mod.S3Client({
                region: this.config.region,
                endpoint: this.config.endpoint,
                forcePathStyle: this.config.forcePathStyle,
                credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
                // Only add checksums where the API requires them: several S3-compatible providers reject the newer default.
                requestChecksumCalculation: 'WHEN_REQUIRED',
                responseChecksumValidation: 'WHEN_REQUIRED',
            }),
        }));
        return this.sdk;
    }
    async put(key, data) {
        assertSafeKey(key);
        const { client, mod } = await this.load();
        await client.send(new mod.PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: data, ContentLength: data.length, ContentType: 'application/octet-stream' }));
    }
    async get(key) {
        assertSafeKey(key);
        const { client, mod } = await this.load();
        try {
            const res = await client.send(new mod.GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
            return Buffer.from(await res.Body.transformToByteArray());
        }
        catch (err) {
            // Only "that key does not exist" means a missing file. Any other 404 (a wrong bucket, say) is a real error.
            const name = err.name;
            if (name === 'NoSuchKey' || name === 'NotFound')
                return null;
            throw err;
        }
    }
    async delete(key) {
        assertSafeKey(key);
        try {
            const { client, mod } = await this.load();
            await client.send(new mod.DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
        }
        catch (err) {
            logger.warn('Could not delete stored file', { error: err.message });
        }
    }
}
/**
 * Cloudinary as a private file store. Every file is uploaded with delivery type "authenticated": Cloudinary never gives it a
 * public URL, and it can only be fetched with a request signed by the API secret, which happens here on the server. Files are
 * kept as image resources (JPEG, PNG, WebP and PDF are all pictures to Cloudinary), so they can be previewed in Cloudinary's
 * own media library, and are only ever handed to a viewer the API has authorized. Files stored before that, as "raw" files
 * under the whole key, are still found and are removed with the rest. The SDK is loaded on first use.
 */
export class CloudinaryStorage {
    config;
    sdk;
    constructor(config) {
        this.config = config;
    }
    load() {
        this.sdk ??=
            this.config.sdk?.() ??
                import('cloudinary').then(({ v2 }) => {
                    v2.config({ cloud_name: this.config.cloudName, api_key: this.config.apiKey, api_secret: this.config.apiSecret, secure: true });
                    return v2;
                });
        return this.sdk;
    }
    /** An image's public id has no extension: "og-gaming/payments/<id>.png" is stored as "og-gaming/payments/<id>". */
    static idOf = (key) => key.replace(/\.[a-z]+$/, '');
    static extOf = (key) => key.split('.').pop() ?? '';
    /** The download address for a stored file, as an image (current) or as a raw file (older files). */
    async address(key, legacy, seconds) {
        const cloudinary = await this.load();
        const expires = seconds ? { expires_at: Math.floor(Date.now() / 1000) + seconds } : {};
        return legacy
            ? cloudinary.utils.private_download_url(key, '', { resource_type: 'raw', type: 'authenticated', ...expires })
            : cloudinary.utils.private_download_url(CloudinaryStorage.idOf(key), CloudinaryStorage.extOf(key), { resource_type: 'image', type: 'authenticated', ...expires });
    }
    async put(key, data) {
        assertSafeKey(key);
        const cloudinary = await this.load();
        await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', type: 'authenticated', public_id: CloudinaryStorage.idOf(key), overwrite: false, unique_filename: false, use_filename: false }, (err) => (err ? reject(new Error(err.message ?? 'Cloudinary upload failed')) : resolve()));
            stream.end(data);
        });
    }
    async get(key) {
        assertSafeKey(key);
        for (const legacy of [false, true]) {
            const res = await fetch(await this.address(key, legacy));
            if (res.status === 404)
                continue; // not stored that way: try the older way
            if (!res.ok)
                throw new Error(`Cloudinary download failed (${res.status})`);
            return Buffer.from(await res.arrayBuffer());
        }
        return null;
    }
    async temporaryUrl(key, seconds) {
        assertSafeKey(key);
        // A signed request that Cloudinary itself stops honouring after `seconds`; nothing about the file becomes public.
        for (const legacy of [false, true]) {
            const url = await this.address(key, legacy, seconds);
            // Say so now if the file is gone, rather than opening a tab that shows an error page.
            if ((await fetch(url, { method: 'HEAD' })).status !== 404)
                return url;
        }
        return null;
    }
    async putPublic(key, data) {
        assertSafeKey(key);
        const cloudinary = await this.load();
        const publicId = key.replace(/\.[a-z]+$/, ''); // an image's public id carries no extension
        const url = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', type: 'upload', public_id: publicId, overwrite: false, unique_filename: false, use_filename: false, allowed_formats: ['jpg', 'png', 'webp'] }, (err, res) => err || !res?.secure_url ? reject(new Error(err?.message ?? 'Cloudinary upload failed')) : resolve(String(res.secure_url)));
            stream.end(data);
        });
        // Let Cloudinary pick the best format and quality for each visitor.
        return url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
    }
    async deletePublic(url) {
        const publicId = this.publicIdOf(url);
        if (!publicId)
            return; // not one of this account's images: leave it alone
        try {
            const cloudinary = await this.load();
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload', invalidate: true });
        }
        catch (err) {
            logger.warn('Could not delete stored image', { error: err.message });
        }
    }
    /** "https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto/v123/og-gaming/images/logo/<id>.png" -> "og-gaming/images/logo/<id>". */
    publicIdOf(url) {
        const prefix = `https://res.cloudinary.com/${this.config.cloudName}/image/upload/`;
        if (!url.startsWith(prefix))
            return null;
        const parts = url.slice(prefix.length).split('/');
        while (parts.length > 1 && (parts[0].includes(',') || parts[0].includes('_')))
            parts.shift(); // transformations
        if (/^v\d+$/.test(parts[0] ?? ''))
            parts.shift(); // version
        const id = parts.join('/').replace(/\.[a-z]+$/, '');
        return /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-f0-9-]{36}$/.test(id) ? id : null;
    }
    async delete(key) {
        assertSafeKey(key);
        try {
            const cloudinary = await this.load();
            await cloudinary.uploader.destroy(CloudinaryStorage.idOf(key), { resource_type: 'image', type: 'authenticated', invalidate: true });
            await cloudinary.uploader.destroy(key, { resource_type: 'raw', type: 'authenticated', invalidate: true }); // a file kept the older way
        }
        catch (err) {
            logger.warn('Could not delete stored file', { error: err.message });
        }
    }
}
export function createStorage() {
    if (env.STORAGE_DRIVER === 'cloudinary') {
        return new CloudinaryStorage({ cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET });
    }
    if (env.STORAGE_DRIVER === 's3') {
        return new S3Storage({
            bucket: env.S3_BUCKET,
            region: env.S3_REGION,
            endpoint: env.S3_ENDPOINT,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
        });
    }
    return new LocalStorage();
}
export const storage = createStorage();
/** Server-generated key: callers can never influence the path. */
export const newStorageKey = (folder, ext) => `${folder}/${randomUUID()}.${ext}`;
/** A new key inside a store's own folder for one kind of file. */
export const storeKey = (storeSlug, folder, ext) => newStorageKey(`${storeSlug}/${folder}`, ext);
//# sourceMappingURL=storage.service.js.map