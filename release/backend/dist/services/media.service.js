import { Business, GamingCategory, Station } from '../models/index.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { detectFileType } from '../utils/fileType.js';
import { findOwned } from '../helpers/tenant.helper.js';
import { audit } from './audit.service.js';
import { storage, storeKey } from './storage.service.js';
/**
 * A store's public pictures. Each goes in the store's own folder ("<store>/images/logo/<id>.png") in file storage and the
 * address it can be seen at is kept on the store. What the bytes are decides what is accepted (a JPEG, PNG or WebP, never a
 * PDF or anything renamed), and a replaced or removed picture is deleted from storage so nothing is left behind.
 */
export const IMAGE_KINDS = ['logo', 'cover'];
const KIND = {
    logo: { field: 'logo', folder: 'images/logo' },
    cover: { field: 'coverImage', folder: 'images/cover' },
};
const pictures = (b) => ({ logo: b.logo ?? null, coverImage: b.coverImage ?? null });
export async function setStoreImage(businessId, kind, file, req) {
    if (!file)
        throw new ValidationError('Attach a picture', [{ path: 'file', message: 'required' }]);
    if (!storage.putPublic)
        throw new AppError('Picture uploads need Cloudinary file storage (STORAGE_DRIVER=cloudinary).', 501, 'IMAGE_UPLOAD_UNAVAILABLE');
    const detected = detectFileType(file.buffer);
    if (!detected || !detected.mime.startsWith('image/'))
        throw new ValidationError('That file is not a JPEG, PNG or WebP picture', [{ path: 'file', message: 'unsupported file type' }]);
    const business = await Business.findById(businessId).select('slug logo coverImage').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const { field, folder } = KIND[kind];
    const url = await storage.putPublic(storeKey(business.slug, folder, detected.ext), file.buffer);
    try {
        await Business.updateOne({ _id: businessId }, { $set: { [field]: url } });
    }
    catch (err) {
        await storage.deletePublic?.(url); // do not leave an orphaned file behind
        throw err;
    }
    const previous = business[field];
    if (previous && previous !== url)
        await storage.deletePublic?.(previous);
    await audit({ action: 'STORE_IMAGE_UPDATED', entity: 'Business', entityId: businessId, businessId, req, metadata: { kind, size: file.size, type: detected.mime } });
    return pictures({ ...business, [field]: url });
}
export async function removeStoreImage(businessId, kind, req) {
    const business = await Business.findById(businessId).select('logo coverImage').lean();
    if (!business)
        throw new NotFoundError('Store not found');
    const { field } = KIND[kind];
    const previous = business[field];
    if (previous) {
        await Business.updateOne({ _id: businessId }, { $unset: { [field]: '' } });
        await storage.deletePublic?.(previous);
        await audit({ action: 'STORE_IMAGE_REMOVED', entity: 'Business', entityId: businessId, businessId, req, metadata: { kind } });
    }
    return pictures({ ...business, [field]: null });
}
/**
 * A picture of a category ("Premium Room") or a station ("PC-03"), so customers can see what they are booking. It goes in
 * "<store>/images/categories/<id>.png" or "<store>/images/stations/<id>.png". A station without its own picture shows its
 * category's, so one good photo per category is enough.
 */
export const ITEM_TARGETS = ['category', 'station'];
const ITEM = {
    category: { model: GamingCategory, folder: 'images/categories', label: 'Category', action: 'CATEGORY_IMAGE' },
    station: { model: Station, folder: 'images/stations', label: 'Station', action: 'STATION_IMAGE' },
};
export async function setItemImage(businessId, target, id, file, req) {
    if (!file)
        throw new ValidationError('Attach a picture', [{ path: 'file', message: 'required' }]);
    if (!storage.putPublic)
        throw new AppError('Picture uploads need Cloudinary file storage (STORAGE_DRIVER=cloudinary).', 501, 'IMAGE_UPLOAD_UNAVAILABLE');
    const detected = detectFileType(file.buffer);
    if (!detected || !detected.mime.startsWith('image/'))
        throw new ValidationError('That file is not a JPEG, PNG or WebP picture', [{ path: 'file', message: 'unsupported file type' }]);
    const { model, folder, label, action } = ITEM[target];
    const item = await findOwned(model, id, businessId, label); // another store's item is "not found"
    const store = await Business.findById(businessId).select('slug').lean();
    if (!store)
        throw new NotFoundError('Store not found');
    const url = await storage.putPublic(storeKey(store.slug, folder, detected.ext), file.buffer);
    try {
        await model.updateOne({ _id: id, businessId }, { $set: { image: url } });
    }
    catch (err) {
        await storage.deletePublic?.(url);
        throw err;
    }
    if (item.image && item.image !== url)
        await storage.deletePublic?.(item.image);
    await audit({ action: `${action}_UPDATED`, entity: label === 'Station' ? 'Station' : 'GamingCategory', entityId: id, businessId, req, metadata: { size: file.size, type: detected.mime } });
    return { image: url };
}
export async function removeItemImage(businessId, target, id, req) {
    const { model, label, action } = ITEM[target];
    const item = await findOwned(model, id, businessId, label);
    if (item.image) {
        await model.updateOne({ _id: id, businessId }, { $unset: { image: '' } });
        await storage.deletePublic?.(item.image);
        await audit({ action: `${action}_REMOVED`, entity: label === 'Station' ? 'Station' : 'GamingCategory', entityId: id, businessId, req });
    }
    return { image: null };
}
//# sourceMappingURL=media.service.js.map