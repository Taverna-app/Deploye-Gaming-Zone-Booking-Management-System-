import { DateTime } from 'luxon';
import { Booking, Business, BusinessSettings, GamingCategory, Payment, PricingRule, PromoCode, Station, SystemSetting, User, } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { generateBookingNumber } from '../utils/bookingNumber.js';
import { localDate, zonedToUtc } from '../utils/dateTime.js';
import { slugify } from '../utils/slug.js';
import { logger } from '../utils/logger.js';
import { CATEGORY_CATALOG } from '../constants/gamingCatalog.js';
const TZ = 'Asia/Karachi';
const BUSINESSES = [
    {
        name: 'Zobix Gaming Arena',
        slug: 'zobix-gaming-arena',
        bookingPrefix: 'ZGA',
        city: 'Lahore',
        adminName: 'Zobix Arena Admin',
        adminEmail: 'admin@zobix-arena.demo',
        categories: [{ key: 'pc' }, { key: 'ps5' }, { key: 'room' }, { key: 'racing' }, { key: 'pool' }],
        promo: 'WELCOME10',
    },
    {
        name: 'OG Gaming Demo',
        slug: 'og-gaming',
        bookingPrefix: 'OGD',
        city: 'Karachi',
        adminName: 'OG Admin',
        adminEmail: 'admin@og-gaming.demo',
        categories: [{ key: 'pc', count: 4 }, { key: 'ps5', count: 2 }, { key: 'pool' }],
        promo: 'OGFIRST',
    },
    {
        name: 'Arcadium Demo',
        slug: 'arcadium',
        bookingPrefix: 'ARC',
        city: 'Islamabad',
        adminName: 'Arcadium Admin',
        adminEmail: 'admin@arcadium.demo',
        categories: [{ key: 'pc', count: 5 }, { key: 'ps5', count: 3 }, { key: 'room', count: 1 }, { key: 'racing' }],
        promo: 'ARCADE15',
    },
];
const CUSTOMERS = [
    { name: 'Ali Raza', email: 'ali.raza@customer.demo', phone: '+923001110001' },
    { name: 'Sara Ahmed', email: 'sara.ahmed@customer.demo', phone: '+923001110002' },
    { name: 'Hamza Sheikh', email: 'hamza.sheikh@customer.demo', phone: '+923001110003' },
    { name: 'Ayesha Noor', email: 'ayesha.noor@customer.demo', phone: '+923001110004' },
    { name: 'Bilal Khan', email: 'bilal.khan@customer.demo', phone: '+923001110005' },
];
export async function runSeed({ password, superAdminEmail = 'superadmin@zobixsolutions.com', reset = false }) {
    if (reset) {
        const collections = [Booking, Payment, PricingRule, PromoCode, Station, GamingCategory, BusinessSettings, Business, User, SystemSetting];
        await Promise.all(collections.map((m) => m.deleteMany({})));
        logger.warn('Existing data removed (--reset)');
    }
    const passwordHash = await hashPassword(password);
    await SystemSetting.updateOne({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true });
    const superAdmin = await User.findOneAndUpdate({ email: superAdminEmail }, { $setOnInsert: { name: 'Zobix Super Admin', email: superAdminEmail, passwordHash, role: 'SUPER_ADMIN', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
    const customers = [];
    for (const c of CUSTOMERS) {
        customers.push(await User.findOneAndUpdate({ email: c.email }, { $setOnInsert: { ...c, passwordHash, role: 'CUSTOMER', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' }));
    }
    const summary = [];
    for (const def of BUSINESSES) {
        if (await Business.exists({ slug: def.slug })) {
            logger.info(`Business "${def.name}" already exists, skipping`);
            continue;
        }
        const business = await Business.create({
            name: def.name,
            slug: def.slug,
            bookingPrefix: def.bookingPrefix,
            city: def.city,
            description: `${def.name} - book PCs, consoles and private rooms online.`,
            address: `Demo address, ${def.city}`,
            phone: '+92300000000',
            whatsapp: '92300000000',
            email: def.adminEmail,
            timezone: TZ,
            currency: 'PKR',
            openingTime: '10:00',
            closingTime: '02:00',
            subscriptionStatus: 'ACTIVE',
            bankDetails: { bankName: 'Demo Bank', accountTitle: def.name, accountNumber: '0000-0000000-0', instructions: 'Send screenshot after transfer.' },
            createdBy: superAdmin._id,
        });
        await BusinessSettings.create({ businessId: business._id, taxPercent: 0 });
        await User.findOneAndUpdate({ email: def.adminEmail }, { $setOnInsert: { name: def.adminName, email: def.adminEmail, passwordHash, role: 'STORE_ADMIN', businessIds: [business._id], isEmailVerified: true } }, { upsert: true });
        // Categories, stations, pricing
        const stationsByCategory = new Map();
        const ratesByCategory = new Map();
        let order = 0;
        for (const entry of def.categories) {
            const cat = CATEGORY_CATALOG[entry.key];
            const category = await GamingCategory.create({
                businessId: business._id,
                name: cat.name,
                slug: slugify(cat.name),
                icon: cat.icon,
                displayOrder: order++,
            });
            const count = entry.count ?? cat.count;
            const stations = await Station.insertMany(Array.from({ length: count }, (_, i) => ({
                businessId: business._id,
                categoryId: category._id,
                name: `${cat.name} ${i + 1}`,
                code: `${cat.prefix}-${String(i + 1).padStart(2, '0')}`,
                capacity: cat.capacity,
                features: cat.features,
            })));
            stationsByCategory.set(String(category._id), stations);
            ratesByCategory.set(String(category._id), cat.pricePerHour);
            await PricingRule.insertMany([
                { businessId: business._id, categoryId: category._id, name: `${cat.name} standard`, ruleType: 'NORMAL', pricePerHour: cat.pricePerHour, priority: 0 },
                { businessId: business._id, categoryId: category._id, name: `${cat.name} evening peak`, ruleType: 'PEAK', startTime: '18:00', endTime: '23:59', multiplier: 1.25, priority: 10 },
                { businessId: business._id, categoryId: category._id, name: `${cat.name} weekend`, ruleType: 'WEEKEND', daysOfWeek: [5, 6], multiplier: 1.15, priority: 5 },
            ]);
        }
        await PromoCode.create({
            businessId: business._id,
            code: def.promo,
            discountType: 'PERCENTAGE',
            value: 10,
            maximumDiscount: 500,
            minimumAmount: 300,
        });
        // Sample bookings: past completed (paid) + upcoming + one cancelled. Distinct stations/days => no overlaps.
        const now = DateTime.now().setZone(TZ);
        const allStations = [...stationsByCategory.values()].flat();
        const samples = [
            { dayOffset: -6, hour: 16, minutes: 120, status: 'COMPLETED', method: 'PAY_AT_VENUE' },
            { dayOffset: -5, hour: 19, minutes: 180, status: 'COMPLETED', method: 'ONLINE' },
            { dayOffset: -4, hour: 14, minutes: 60, status: 'COMPLETED', method: 'PAY_AT_VENUE' },
            { dayOffset: -3, hour: 20, minutes: 120, status: 'COMPLETED', method: 'BANK_TRANSFER' },
            { dayOffset: -2, hour: 17, minutes: 90, status: 'CANCELLED', method: 'PAY_AT_VENUE' },
            { dayOffset: -1, hour: 21, minutes: 120, status: 'COMPLETED', method: 'ONLINE' },
            { dayOffset: 1, hour: 18, minutes: 120, status: 'CONFIRMED', method: 'PAY_AT_VENUE' },
            { dayOffset: 2, hour: 20, minutes: 60, status: 'PENDING', method: 'BANK_TRANSFER' },
        ];
        for (const [i, s] of samples.entries()) {
            const station = allStations[i % allStations.length];
            const customer = customers[i % customers.length];
            const date = now.plus({ days: s.dayOffset }).toFormat('yyyy-MM-dd');
            const start = `${String(s.hour).padStart(2, '0')}:00`;
            const startDateTime = zonedToUtc(date, start, TZ);
            const endDateTime = new Date(startDateTime.getTime() + s.minutes * 60_000);
            const rate = ratesByCategory.get(String(station.categoryId));
            const total = Math.round((rate * s.minutes) / 60);
            const paid = s.status === 'COMPLETED';
            const booking = await Booking.create({
                businessId: business._id,
                bookingNumber: await generateBookingNumber(business, date),
                customerId: customer._id,
                stationId: station._id,
                categoryId: station.categoryId,
                bookingDate: date,
                startTime: start,
                endTime: DateTime.fromJSDate(endDateTime, { zone: TZ }).toFormat('HH:mm'),
                startDateTime,
                endDateTime,
                durationMinutes: s.minutes,
                numberOfPlayers: 1,
                baseAmount: total,
                totalAmount: total,
                paymentMethod: s.method,
                paymentStatus: paid ? 'PAID' : 'PENDING',
                amountPaid: paid ? total : 0,
                bookingStatus: s.status,
                checkedInAt: paid ? startDateTime : undefined,
                checkedOutAt: paid ? endDateTime : undefined,
                cancelledAt: s.status === 'CANCELLED' ? startDateTime : undefined,
                cancellationReason: s.status === 'CANCELLED' ? 'Customer request' : undefined,
                createdBy: customer._id,
            });
            if (s.status !== 'CANCELLED') {
                await Payment.create({
                    bookingId: booking._id,
                    businessId: business._id,
                    customerId: customer._id,
                    amount: total,
                    method: s.method,
                    status: paid ? 'PAID' : 'PENDING',
                    paidAt: paid ? endDateTime : undefined,
                    approvedBy: paid ? superAdmin._id : undefined,
                });
            }
        }
        summary.push({ business: def.name, stations: allStations.length, admin: def.adminEmail, today: localDate(new Date(), TZ) });
    }
    return { superAdminEmail, businesses: summary };
}
//# sourceMappingURL=seedData.js.map