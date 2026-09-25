import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Booking, Business, BusinessSettings, GamingCategory, PasswordResetToken, Payment, PricingRule, Station, SystemSetting, User, } from '../models/index.js';
import { CATEGORY_CATALOG } from '../constants/gamingCatalog.js';
import { getEffectiveSettings } from './availability.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { generateOpaqueToken } from '../utils/token.js';
import { signAccessToken } from '../utils/jwt.js';
import { slugify } from '../utils/slug.js';
import { paginate, searchFilter, sortSpec, dateRangeFilter } from '../utils/queryBuilder.js';
import { audit } from './audit.service.js';
import { createNotification } from './notification.service.js';
import { sendStoreRegistrationEmail } from './email.service.js';
import { runInBackground } from '../utils/background.js';
import { disconnectBusiness } from '../config/socket.js';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IMPERSONATION_TTL = '1h';
const BUSINESS_SORT_FIELDS = ['name', 'city', 'status', 'subscriptionStatus', 'createdAt'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/**
 * "Zobix Gaming Arena" -> ZGA, then progressively longer name prefixes. Stores with similar names would otherwise run
 * out of candidates ("Game Zone 1", "Game Zone 2", ...), so the list carries on with the best base plus one or two
 * extra letters (GZA, GZB, ... GZAA, GZAB, ...). Prefixes are 2-5 letters.
 */
export function prefixCandidates(name) {
    const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
    const initials = name
        .toUpperCase()
        .split(/[^A-Z]+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join('');
    const natural = [initials.slice(0, 5), letters.slice(0, 3), letters.slice(0, 4), letters.slice(0, 5)].filter((c) => c.length >= 2);
    const base = (initials.length >= 2 ? initials : letters).slice(0, 3);
    const extended = [];
    if (base.length >= 2) {
        for (const x of ALPHABET)
            extended.push(`${base}${x}`.slice(0, 5));
        for (const x of ALPHABET)
            for (const y of ALPHABET)
                extended.push(`${base.slice(0, 3)}${x}${y}`.slice(0, 5));
    }
    return [...new Set([...natural, ...extended])];
}
async function pickBookingPrefix(name, requested) {
    if (requested) {
        if (await Business.exists({ bookingPrefix: requested })) {
            throw new ConflictError(`Booking prefix "${requested}" is already used by another business`, 'PREFIX_TAKEN');
        }
        return requested;
    }
    const candidates = prefixCandidates(name);
    const taken = new Set((await Business.find({ bookingPrefix: { $in: candidates } }).select('bookingPrefix').lean()).map((b) => b.bookingPrefix));
    const free = candidates.find((c) => !taken.has(c));
    if (free)
        return free;
    throw new ConflictError('Could not derive a unique booking prefix; please provide one', 'PREFIX_TAKEN');
}
async function ensureSlugFree(slug, exceptId) {
    const clash = await Business.findOne({ slug, ...(exceptId && { _id: { $ne: exceptId } }) }).select('_id').lean();
    if (clash)
        throw new ConflictError(`The slug "${slug}" is already taken`, 'SLUG_TAKEN');
}
/**
 * Store onboarding: business + settings + store admin + default categories/pricing, atomically.
 * Emails, notifications and the audit event happen after the transaction commits.
 */
export async function createBusiness(input, actor, req) {
    const slug = input.slug ?? slugify(input.name);
    if (!slug)
        throw new ValidationError('Could not derive a slug from the business name');
    await ensureSlugFree(slug);
    const bookingPrefix = await pickBookingPrefix(input.name, input.bookingPrefix);
    const platform = await SystemSetting.findOne({ key: 'platform' }).lean();
    let inviteToken;
    let existingAccount = false;
    let result;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            inviteToken = undefined;
            existingAccount = false;
            const [business] = await Business.create([
                {
                    name: input.name,
                    slug,
                    bookingPrefix,
                    description: input.description,
                    phone: input.phone,
                    whatsapp: input.whatsapp,
                    email: input.email,
                    address: input.address,
                    city: input.city,
                    country: input.country,
                    timezone: input.timezone ?? platform?.defaultTimezone,
                    currency: input.currency ?? platform?.defaultCurrency,
                    openingTime: input.openingTime,
                    closingTime: input.closingTime,
                    logo: input.logo,
                    coverImage: input.coverImage,
                    subscriptionStatus: input.subscriptionStatus,
                    createdBy: actor.id,
                },
            ], { session });
            const defaults = platform?.bookingDefaults;
            await BusinessSettings.create([
                {
                    businessId: business._id,
                    ...(defaults && {
                        minimumBookingMinutes: defaults.minimumBookingMinutes,
                        maximumBookingMinutes: defaults.maximumBookingMinutes,
                        advanceBookingDays: defaults.advanceBookingDays,
                        cancellationMinutes: defaults.cancellationMinutes,
                    }),
                },
            ], { session });
            // Store admin: reuse an existing store-admin account, otherwise create one.
            let admin = await User.findOne({ email: input.ownerEmail }).session(session);
            if (admin) {
                if (admin.role !== 'STORE_ADMIN') {
                    throw new ConflictError('This email already belongs to a different type of account', 'EMAIL_TAKEN');
                }
                admin.businessIds.push(business._id);
                await admin.save({ session });
                existingAccount = true;
            }
            else {
                // Without a temporary password the account gets an unguessable one and the owner sets theirs via invite.
                const password = input.temporaryPassword ?? crypto.randomBytes(32).toString('hex');
                [admin] = await User.create([
                    {
                        name: input.ownerName,
                        email: input.ownerEmail,
                        phone: input.ownerPhone,
                        passwordHash: await hashPassword(password),
                        role: 'STORE_ADMIN',
                        businessIds: [business._id],
                        isEmailVerified: true,
                    },
                ], { session });
                if (!input.temporaryPassword) {
                    const { token, tokenHash } = generateOpaqueToken();
                    await PasswordResetToken.create([{ userId: admin._id, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) }], { session });
                    inviteToken = token;
                }
            }
            if (input.createDefaultCategories) {
                let order = 0;
                for (const cat of Object.values(CATEGORY_CATALOG)) {
                    const [category] = await GamingCategory.create([{ businessId: business._id, name: cat.name, slug: slugify(cat.name), icon: cat.icon, displayOrder: order++ }], { session });
                    await PricingRule.create([
                        {
                            businessId: business._id,
                            categoryId: category._id,
                            name: `${cat.name} standard`,
                            ruleType: 'NORMAL',
                            pricePerHour: cat.pricePerHour,
                        },
                    ], { session });
                }
            }
            result = { business: business, admin: admin };
        });
    }
    finally {
        await session.endSession();
    }
    const { business, admin } = result;
    await audit({
        action: 'BUSINESS_CREATED',
        entity: 'Business',
        entityId: business._id,
        businessId: business._id,
        req,
        metadata: { name: business.name, slug, adminId: String(admin._id), existingAdminAccount: existingAccount },
    });
    await Promise.all([
        createNotification({
            userId: actor.id,
            businessId: business._id,
            type: 'STORE_CREATED',
            title: 'Store registered',
            message: `${business.name} was registered.`,
            metadata: { businessId: String(business._id) },
        }),
        createNotification({
            userId: admin._id,
            businessId: business._id,
            type: 'STORE_CREATED',
            title: `Welcome to ${business.name}`,
            message: 'Your gaming zone is ready. Add your stations and pricing to start taking bookings.',
        }),
    ]);
    runInBackground('store registration email', () => sendStoreRegistrationEmail({ to: admin.email, ownerName: admin.name, businessName: business.name, inviteToken, existingAccount }));
    return { business: business.toJSON(), admin: admin.toJSON(), invitationSent: Boolean(inviteToken) };
}
async function statsFor(businessIds) {
    const [bookings, revenue, admins] = await Promise.all([
        Booking.aggregate([{ $match: { businessId: { $in: businessIds } } }, { $group: { _id: '$businessId', count: { $sum: 1 } } }]),
        Payment.aggregate([
            { $match: { businessId: { $in: businessIds }, status: 'PAID' } },
            { $group: { _id: '$businessId', total: { $sum: '$amount' } } },
        ]),
        User.find({ role: 'STORE_ADMIN', businessIds: { $in: businessIds } }).select('name email phone businessIds isActive').lean(),
    ]);
    const bookingMap = new Map(bookings.map((b) => [String(b._id), b.count]));
    const revenueMap = new Map(revenue.map((r) => [String(r._id), r.total]));
    return { bookingMap, revenueMap, admins };
}
export async function listBusinesses(q) {
    const filter = {
        ...searchFilter(['name', 'slug', 'city'], q.search),
        ...(q.status && { status: q.status }),
        ...(q.subscriptionStatus && { subscriptionStatus: q.subscriptionStatus }),
        ...(q.city && { city: new RegExp(`^${q.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }),
        ...dateRangeFilter('createdAt', q.startDate, q.endDate),
    };
    const page = await paginate(Business, filter, {
        page: q.page,
        limit: q.limit,
        sort: sortSpec(BUSINESS_SORT_FIELDS, q.sortBy, q.sortOrder),
    });
    const ids = page.data.map((b) => b._id);
    const { bookingMap, revenueMap, admins } = ids.length ? await statsFor(ids) : { bookingMap: new Map(), revenueMap: new Map(), admins: [] };
    const data = page.data.map((b) => ({
        ...b,
        admin: admins.find((a) => a.businessIds.some((id) => String(id) === String(b._id))) ?? null,
        bookingCount: bookingMap.get(String(b._id)) ?? 0,
        revenue: revenueMap.get(String(b._id)) ?? 0,
    }));
    return { data, pagination: page.pagination };
}
export async function getBusiness(id) {
    const business = await Business.findById(id).lean();
    if (!business)
        throw new NotFoundError('Business not found');
    const [settings, stationCount, staffCount, stats] = await Promise.all([
        BusinessSettings.findOne({ businessId: id }).lean(),
        Station.countDocuments({ businessId: id }),
        User.countDocuments({ role: 'STAFF', businessIds: id }),
        statsFor([business._id]),
    ]);
    return {
        ...business,
        settings,
        admins: stats.admins,
        stationCount,
        staffCount,
        bookingCount: stats.bookingMap.get(String(business._id)) ?? 0,
        revenue: stats.revenueMap.get(String(business._id)) ?? 0,
    };
}
export async function updateBusiness(id, input, req) {
    if (input.slug)
        await ensureSlugFree(input.slug, id);
    const updates = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const business = await Business.findByIdAndUpdate(id, { $set: updates }, { returnDocument: 'after', runValidators: true });
    if (!business)
        throw new NotFoundError('Business not found');
    await audit({
        action: 'BUSINESS_UPDATED',
        entity: 'Business',
        entityId: business._id,
        businessId: business._id,
        req,
        metadata: { fields: Object.keys(updates) },
    });
    return business.toJSON();
}
const STATUS_ACTIONS = {
    ACTIVE: 'BUSINESS_ACTIVATED',
    INACTIVE: 'BUSINESS_DEACTIVATED',
    SUSPENDED: 'BUSINESS_SUSPENDED',
};
export async function setBusinessStatus(id, status, req) {
    const business = await Business.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' });
    if (!business)
        throw new NotFoundError('Business not found');
    await audit({ action: STATUS_ACTIONS[status], entity: 'Business', entityId: business._id, businessId: business._id, req });
    if (status !== 'ACTIVE')
        await disconnectBusiness(String(business._id)); // stop streaming a store that was just shut off
    return business.toJSON();
}
/**
 * "Login as Admin": issues a short-lived token for a store admin that carries the acting super
 * admin's id. Passwords are never revealed, and the action is audit-logged (start and end).
 */
export async function impersonateStoreAdmin(businessId, opts, actor, req) {
    const business = await Business.findById(businessId).select('name slug status').lean();
    if (!business)
        throw new NotFoundError('Business not found');
    if (business.status !== 'ACTIVE') {
        throw new ConflictError('Activate this business before viewing it as its admin', 'BUSINESS_NOT_ACTIVE');
    }
    const admin = await User.findOne({
        role: 'STORE_ADMIN',
        isActive: true,
        businessIds: businessId,
        ...(opts.adminId && { _id: opts.adminId }),
    }).select('+tokenVersion');
    if (!admin)
        throw new NotFoundError('No active store admin found for this business');
    const token = signAccessToken({ sub: String(admin._id), tv: admin.tokenVersion ?? 0, imp: actor.id }, IMPERSONATION_TTL);
    await audit({
        action: 'ADMIN_IMPERSONATION_STARTED',
        entity: 'User',
        entityId: admin._id,
        businessId,
        req,
        metadata: { originalSuperAdminId: actor.id, targetAdminId: String(admin._id), reason: opts.reason ?? null },
    });
    return { token, expiresIn: IMPERSONATION_TTL, user: admin.toJSON(), business };
}
/** What the store console needs to know about the store it is working in (timezone, currency, rules). No secrets. */
export async function getStoreContext(businessId) {
    const [business, settings] = await Promise.all([
        Business.findById(businessId).select('name slug logo timezone currency openingTime closingTime status').lean(),
        getEffectiveSettings(businessId),
    ]);
    if (!business)
        throw new NotFoundError('Store not found');
    const { minimumBookingMinutes, maximumBookingMinutes, slotIntervalMinutes, allowWalkIn, allowPayAtVenue, allowBankTransfer } = settings;
    return { ...business, settings: { minimumBookingMinutes, maximumBookingMinutes, slotIntervalMinutes, allowWalkIn, allowPayAtVenue, allowBankTransfer } };
}
//# sourceMappingURL=business.service.js.map