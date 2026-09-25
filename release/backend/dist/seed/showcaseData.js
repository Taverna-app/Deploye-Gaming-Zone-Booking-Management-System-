import { deflateSync } from 'node:zlib';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { AuditLog, Booking, Business, BusinessSettings, Counter, CustomerNote, GamingCategory, Notification, Payment, PricingRule, PromoCode, Review, Station, SystemSetting, User, } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { slugify } from '../utils/slug.js';
import { compactDate } from '../utils/dateTime.js';
import { roundMoney } from '../utils/currency.js';
import { logger } from '../utils/logger.js';
import { priceBooking } from '../helpers/pricing.helper.js';
import { CATEGORY_CATALOG } from '../constants/gamingCatalog.js';
import { storage, storeKey } from '../services/storage.service.js';
import { StaffInvitation } from '../models/index.js';
/**
 * A sales-demo dataset: five Karachi gaming zones, each with its own admin, stations, prices, a promo code and about ten
 * weeks of believable trading (busier at weekends and in the evening, a few cancellations and no-shows, cash and bank
 * transfers and online payments, a couple of transfer receipts waiting for approval, sessions running right now and
 * bookings for the next days).
 *
 * WHAT IS REAL AND WHAT IS NOT. The store names and phone numbers are the businesses' own public contact details. Everything
 * else (stations, prices, opening hours, bank details, customers, bookings) is invented placeholder data so the product has
 * something to show: none of it describes how those businesses actually operate. Change it in Settings / Stations / Pricing
 * (or edit this file) before presenting it as theirs. All customers are made-up people with example addresses.
 */
const TZ = 'Asia/Karachi';
/** Digits with country code and no plus, as the WhatsApp link wants them. */
const whatsappDigits = (phone) => phone.replace(/\D/g, '');
/**
 * Where each store's details come from (from the businesses' own websites and Google listings, checked by the project owner
 * on 2026-09-21):
 *   Arcadium: Farhan Tower address, 24/7, 7 private PC rooms in Standard (Rs 300/hour) and Premium (Rs 420/hour) tiers (the split is not published), PS5 from Rs 400/hour
 *     (Rs 700 with 2 controllers, Rs 1,000 with 4: not modelled, the demo charges the 1-controller rate).
 *   OG Gaming: address, 24-hour opening, 15 PCs in three cabins (240Hz monitors), four PS5 Slim, PC Rs 200/hour, PS5 Rs 500/hour.
 *   O2 Esports: Gulberg Town address, 24/7, PC gaming and PS5 in lobby, projector and room set-ups. Rates are not published.
 *   Deadshot Esports Arena: the two DHA Phase 6 addresses, "PC Arena" open 24 hours, PC and PS5 gaming, tournaments and
 *     private sessions, bookings of 1 to 4 hours. Hourly rates and station counts are not published.
 *   MAN CAVE: address, open 6 PM to 6 AM, 20 gaming PCs, 4 PS5 seats, one 8-ball pool table, two foosball tables. Rates are
 *     not published.
 * Not modelled by the product: multi-hour packs (e.g. 3 hours for Rs 800), per-controller PS5 pricing, tournaments.
 * Placeholder = invented so the demo has something to show. Where a store does not publish its rates the demo still needs a

 * Stores that do not publish their rates (O2 Esports, Deadshot, MAN CAVE) are set to "price on request" by default: customers see
 * "contact the gaming zone" and cannot book, and their history carries no money. `placeholderPrices` gives them labelled
 * placeholder rates instead, for rehearsing the whole booking flow. Station counts other than those listed above are placeholders too.
 */
const O2_NOTE = 'The store lists this set-up but not how many it has: the number of stations is an estimate for this demo.';
const DEADSHOT_NOTE = 'The store confirms PC and PS5 gaming but not how many stations: the number is an estimate for this demo.';
export const SHOWCASE_STORES = [
    {
        name: 'Arcadium',
        slug: 'arcadium',
        bookingPrefix: 'ARC',
        phone: '+923359557043',
        description: 'PC gaming in Standard and Premium rooms, plus PS5, open 24/7 in Gulshan-e-Iqbal. See what is free right now and book a room ahead of time instead of messaging on WhatsApp.',
        address: 'Office #1, Mezzanine Floor, Farhan Tower, Gulshan-e-Iqbal Block 10-A',
        opening: '00:00',
        closing: '00:00',
        pricesPublished: true,
        admin: { name: 'Arcadium Admin', email: 'arcadium@showcase.test' },
        categories: [
            // The website confirms 7 private rooms in two tiers but not the split, so 4 + 3 is an estimate (said so on each station).
            { base: 'pc', count: 4, name: 'Standard Room', prefix: 'STD', pricePerHour: 300, features: ['Ryzen 5 5600', 'RTX 4060', '16GB RAM', '180Hz monitor'], flatPrice: true, stationName: (i) => `Standard Room ${i + 1}`, note: 'The store confirms 7 private rooms in Standard and Premium tiers; how many of each is an estimate for this demo.' },
            { base: 'pc', count: 3, name: 'Premium Room', prefix: 'PRM', pricePerHour: 420, features: ['Ryzen 5 9600X', 'RTX 5060', '16GB DDR5', '360Hz monitor'], flatPrice: true, stationName: (i) => `Premium Room ${i + 1}`, note: 'The store confirms 7 private rooms in Standard and Premium tiers; how many of each is an estimate for this demo.' },
            { base: 'ps5', count: 3, pricePerHour: 400, capacity: 4, features: ['Rs 400/hr with 1 controller', 'Rs 700/hr with 2', 'Rs 1,000/hr with 4'], flatPrice: true, note: 'How many PS5 consoles the store has is an estimate for this demo.' },
        ],
        promo: 'ARCADE10',
        busyness: 0.34,
        noShowGraceMinutes: 0,
    },
    {
        name: 'OG Gaming',
        slug: 'og-gaming',
        bookingPrefix: 'OGG',
        phone: '+923062779481',
        description: 'Open 24 hours in Main Bahadurabad: 15 eSports PCs with 240Hz monitors in three cabins, and a PS5 lounge with four PS5 Slim consoles. Book a seat online instead of on WhatsApp.',
        address: 'Suite # 201, 2nd Floor, Meriums Complex, Near Charr Minar, Beside Alkaram Studio, Main Bahadurabad',
        opening: '00:00',
        closing: '00:00',
        pricesPublished: true,
        admin: { name: 'OG Gaming Admin', email: 'og-gaming@showcase.test' },
        categories: [
            { base: 'pc', count: 15, pricePerHour: 200, features: ['240Hz MSI gaming monitor'], flatPrice: true, stationName: (i) => `Cabin ${Math.floor(i / 5) + 1} · PC ${(i % 5) + 1}` },
            { base: 'ps5', count: 4, pricePerHour: 500, capacity: 2, features: ['PS5 Slim Digital Edition', '2 controllers included'], flatPrice: true, stationName: (i) => `PS5 Lounge · Console ${i + 1}` },
        ],
        promo: 'OGFIRST',
        busyness: 0.3,
        noShowGraceMinutes: 0,
    },
    {
        name: 'Deadshot Esports Arena',
        slug: 'deadshot-esports-arena',
        bookingPrefix: 'DS',
        phone: '+923282068694',
        description: 'PC Arena (open 24 hours) and Console Arena (12 PM to 8:30 AM) in DHA Phase 6: high-end PCs, PS5, tournaments and private sessions. See live availability across both arenas.',
        address: 'PC Arena: 32C 8th Commercial Lane, DHA Phase 6, Bukhari Commercial. Console Arena: 27C Lane 4, DHA Phase 6, Bukhari Commercial',
        opening: '00:00',
        closing: '00:00',
        maxBookingMinutes: 240,
        admin: { name: 'Deadshot Admin', email: 'deadshot@showcase.test' },
        categories: [
            { base: 'pc', count: 12, stationName: (i) => `PC Arena · PC ${i + 1}`, note: DEADSHOT_NOTE },
            { base: 'ps5', count: 4, stationName: (i) => `Console Arena · PS5 ${i + 1}`, note: DEADSHOT_NOTE },
            { base: 'room', count: 2, name: 'Private Session', stationName: (i) => `Private session room ${i + 1}`, note: DEADSHOT_NOTE },
        ],
        promo: 'DEADSHOT10',
        busyness: 0.32,
        noShowGraceMinutes: 30,
    },
    {
        name: 'O2 Esports',
        slug: 'o2-esports',
        bookingPrefix: 'OTE',
        phone: '+923218142317',
        description: 'High-performance PC gaming and PS5 in a lobby, with a projector or in a private room, open 24/7 in Gulberg Town. See what is free right now in every set-up.',
        address: 'Mezzanine Floor, Plot BS-17, Federal B Area, Dastagir Block 7, Gulberg Town',
        opening: '00:00',
        closing: '00:00',
        admin: { name: 'O2 Esports Admin', email: 'o2-esports@showcase.test' },
        categories: [
            // The website lists these set-ups but not how many of each, so every count is an estimate (said so on each station).
            { base: 'pc', count: 6, name: 'PC Lobby', prefix: 'PCL', note: O2_NOTE },
            { base: 'pc', count: 3, name: 'Mid-Tier PC', prefix: 'MID', note: O2_NOTE },
            { base: 'pc', count: 3, name: 'Executive PC', prefix: 'EXE', note: O2_NOTE },
            { base: 'pc', count: 2, name: 'Platinum PC', prefix: 'PLT', note: O2_NOTE },
            { base: 'ps5', count: 3, name: 'PS5 Lobby', prefix: 'LOB', stationName: (i) => `PS5 lobby seat ${i + 1}`, note: O2_NOTE },
            { base: 'ps5', count: 1, name: 'PS5 XL', prefix: 'XL', stationName: () => 'PS5 XL', note: O2_NOTE },
            { base: 'room', count: 1, name: 'PS5 Private Room', prefix: 'PRV', stationName: () => 'PS5 private room', note: O2_NOTE },
            { base: 'room', count: 1, name: 'Executive PS5 Room', prefix: 'XRM', stationName: () => 'Executive PS5 room', note: O2_NOTE },
            { base: 'room', count: 1, name: 'Platinum Lounge', prefix: 'PLG', stationName: () => 'Platinum lounge', note: O2_NOTE },
            { base: 'room', count: 1, name: 'Royal PS5 Room', prefix: 'RYL', stationName: () => 'Royal PS5 room', note: O2_NOTE },
            { base: 'racing', count: 1, name: 'Car Simulator', prefix: 'SIM', stationName: () => 'Car simulator', note: O2_NOTE },
        ],
        promo: 'O2WELCOME',
        busyness: 0.32,
        noShowGraceMinutes: 0,
    },
    {
        name: 'MAN CAVE',
        slug: 'man-cave',
        bookingPrefix: 'MNC',
        phone: '+923099811707',
        description: 'Gaming hangout in Bahadurabad, open 6 PM to 6 AM: 20 gaming PCs, a PS5 lounge, an 8-ball pool table and two foosball tables. Check seat availability online.',
        address: 'Shop #6, Ayesha Residency, Plot #119, Alamgir Road, Bahadurabad',
        opening: '18:00',
        closing: '06:00',
        admin: { name: 'Man Cave Admin', email: 'man-cave@showcase.test' },
        categories: [
            { base: 'pc', count: 20, name: 'Gaming PCs', stationName: (i) => `Seat ${i + 1}` },
            { base: 'ps5', count: 4, name: 'PS5 Lounge', stationName: (i) => `PS5 seat ${i + 1}`, capacity: 1 },
            { base: 'pool', count: 1, name: '8-Ball Pool', prefix: 'POOL', stationName: () => 'Pool table' },
            { base: 'pool', count: 2, name: 'Foosball', prefix: 'FOOS', capacity: 2, features: ['Foosball table'], pricePerHour: 400, stationName: (i) => `Foosball table ${i + 1}` },
        ],
        promo: 'CAVE10',
        busyness: 0.4,
        noShowGraceMinutes: 0,
    },
];
/** Minutes since midnight of an "HH:mm" string. */
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Hours in one business day (24 when opening and closing are the same). */
const spanHours = (def) => (def.opening === def.closing ? 24 : ((((minutesOf(def.closing) - minutesOf(def.opening)) % 1440) + 1440) % 1440) / 60);
/** Whether the store is open at this instant (in Karachi time). */
export function isOpenAt(def, at = new Date()) {
    if (def.opening === def.closing)
        return true;
    const local = DateTime.fromJSDate(at, { zone: TZ });
    const m = local.hour * 60 + local.minute;
    const open = minutesOf(def.opening);
    const close = minutesOf(def.closing);
    return close <= open ? m >= open || m < close : m >= open && m < close;
}
/** How busy an hour of the day is compared with the store's average: evenings and the night are the rush. */
const hourWeight = (hour) => (hour >= 18 || hour < 2 ? 1.6 : hour >= 12 && hour < 18 ? 0.7 : hour < 6 ? 0.35 : 0.25);
const CUSTOMER_NAMES = [
    'Ali Raza', 'Sara Ahmed', 'Hamza Sheikh', 'Ayesha Noor', 'Bilal Khan', 'Fatima Zehra', 'Usman Ghani', 'Zainab Malik',
    'Omar Farooq', 'Hira Baig', 'Saad Qureshi', 'Mariam Siddiqui', 'Danish Iqbal', 'Noor Fatima', 'Kamran Butt', 'Iqra Hussain',
    'Talha Mirza', 'Areeba Javed', 'Shahzaib Ansari', 'Rabia Chaudhry', 'Faizan Memon', 'Laiba Rehman', 'Junaid Soomro', 'Mahnoor Aslam',
];
const FIRST_NAMES = ['Ahmed', 'Zain', 'Hassan', 'Ibrahim', 'Yusuf', 'Rayyan', 'Arslan', 'Waqas', 'Adeel', 'Haris', 'Sana', 'Maryam', 'Anum', 'Komal', 'Nimra', 'Sadia', 'Tooba', 'Hoorain', 'Minahil', 'Aiza'];
const LAST_NAMES = ['Khan', 'Ali', 'Shah', 'Lodhi', 'Abbasi', 'Rizvi', 'Baloch', 'Farooqui', 'Kazmi', 'Lakhani', 'Bhatti', 'Dar', 'Zaidi', 'Pirzada', 'Naqvi'];
/** The named regulars first, then enough other people that the customer list looks like a real zone's. */
const ALL_CUSTOMER_NAMES = [...CUSTOMER_NAMES, ...FIRST_NAMES.flatMap((f) => LAST_NAMES.map((l) => `${f} ${l}`)).slice(0, 126)];
/** Small deterministic random generator (mulberry32): the same seed builds the same shop floor every time. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** 5x7 letter shapes, enough to write the words on the sample receipt. */
const FONT = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
};
/**
 * A small valid PNG that looks like a bank-transfer receipt screenshot ("BANK TRANSFER" header, "SAMPLE RECEIPT", "DEMO ONLY"),
 * so the payment screen has a picture that is plainly a stand-in and not mistaken for a real customer's proof.
 */
export function sampleReceiptPng() {
    const width = 320;
    const height = 420;
    const px = Buffer.alloc(width * height * 3, 0xfb); // near-white page
    const rect = (x, y, w, h, [r, g, b]) => {
        for (let j = y; j < y + h && j < height; j++)
            for (let i = x; i < x + w && i < width; i++)
                px.set([r, g, b], (j * width + i) * 3);
    };
    const text = (label, y, scale, color) => {
        const advance = 6 * scale;
        let x = Math.floor((width - label.length * advance + scale) / 2);
        for (const ch of label) {
            const glyph = FONT[ch];
            if (glyph)
                glyph.forEach((row, gy) => [...row].forEach((bit, gx) => bit === '1' && rect(x + gx * scale, y + gy * scale, scale, scale, color)));
            x += advance;
        }
    };
    rect(0, 0, width, 64, [30, 41, 90]); // header bar
    text('BANK TRANSFER', 20, 3, [255, 255, 255]);
    text('SAMPLE RECEIPT', 110, 3, [30, 30, 40]);
    text('DEMO ONLY', 160, 3, [200, 40, 40]);
    for (const [i, w] of [220, 180, 240, 150, 200].entries())
        rect(40, 240 + i * 24, w, 8, [190, 194, 205]); // detail lines
    rect(40, 372, 240, 3, [120, 200, 150]);
    rect(0, 0, width, 2, [30, 41, 90]);
    rect(0, height - 2, width, 2, [30, 41, 90]);
    const rows = Array.from({ length: height }, (_, y) => Buffer.concat([Buffer.from([0]), px.subarray(y * width * 3, (y + 1) * width * 3)]));
    const table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buf) => {
        let c = 0xffffffff;
        for (const b of buf)
            c = table[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        body.copy(out, 4);
        out.writeUInt32BE(crc(body), 8 + data.length);
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
/**
 * Removes the five showcase stores (matched by slug, so an older "OG Gaming Demo" or "Arcadium Demo" from the generic seed
 * goes too) and everything that belongs to them: stations, categories, prices, promo codes, settings, bookings, payments (and
 * their receipt files), reviews, customer notes, notifications, invitations, booking counters and the stores' own admin and
 * staff accounts. Every other store, all customers and the platform's audit log are left alone.
 */
export async function removeShowcaseStores() {
    const stores = await Business.find({ slug: { $in: SHOWCASE_STORES.map((s) => s.slug) } }).select('name').lean();
    const ids = stores.map((s) => s._id);
    if (ids.length === 0)
        return { stores: [], bookings: 0, users: 0 };
    for (const p of await Payment.find({ businessId: { $in: ids }, proofImage: { $exists: true } }).select('+proofImage').lean()) {
        if (p.proofImage)
            await storage.delete(p.proofImage).catch(() => undefined); // receipt files are only kept for the demo
    }
    const bookings = (await Booking.deleteMany({ businessId: { $in: ids } })).deletedCount;
    const owned = { businessId: { $in: ids } };
    await Promise.all([Payment, Station, GamingCategory, PricingRule, PromoCode, BusinessSettings, Review, CustomerNote, Notification, StaffInvitation].map((m) => m.deleteMany(owned)));
    await Counter.deleteMany({ _id: { $in: ids.map((id) => new RegExp(`^booking:${String(id)}:`)) } });
    // Accounts that only ever belonged to these stores. A person who also runs another store keeps their account.
    const staff = await User.find({ role: { $in: ['STORE_ADMIN', 'STAFF'] }, businessIds: { $in: ids } }).select('businessIds').lean();
    const gone = staff.filter((u) => u.businessIds.every((b) => ids.some((id) => String(id) === String(b)))).map((u) => u._id);
    const users = (await User.deleteMany({ _id: { $in: gone } })).deletedCount;
    await User.updateMany({ _id: { $in: staff.map((u) => u._id).filter((id) => !gone.some((g) => String(g) === String(id))) } }, { $pull: { businessIds: { $in: ids } } });
    await Business.deleteMany({ _id: { $in: ids } });
    return { stores: stores.map((s) => s.name), bookings, users };
}
/**
 * Puts the sample receipt image in the configured file storage, in each store's own "payments" folder ("<store>/payments/<id>.png"),
 * and points the showcase payments at it. Needed after switching storage (say from local disk to Cloudinary) or folder layout:
 * the payments still name their receipt, but the file is only where it was first written. Receipts kept under an old name are
 * moved. Safe to repeat.
 */
export async function restoreShowcaseReceipts() {
    const stores = await Business.find({ slug: { $in: SHOWCASE_STORES.map((s) => s.slug) } }).select('slug').lean();
    const receipt = sampleReceiptPng();
    let moved = 0;
    let files = 0;
    for (const store of stores) {
        const payments = await Payment.find({ businessId: store._id, proofImage: { $exists: true } }).select('+proofImage').lean();
        if (payments.length === 0)
            continue;
        const folder = `${store.slug}/payments/`;
        const current = [...new Set(payments.map((p) => p.proofImage))];
        const target = current.find((k) => k.startsWith(folder)) ?? storeKey(store.slug, 'payments', 'png');
        await storage.delete(target).catch(() => undefined); // a stored file is never overwritten, so replace it
        await storage.put(target, receipt);
        files++;
        for (const key of current.filter((k) => k !== target)) {
            const res = await Payment.updateMany({ businessId: store._id, proofImage: key }, { $set: { proofImage: target } });
            moved += res.modifiedCount;
            await storage.delete(key).catch(() => undefined);
        }
    }
    return { stores: stores.length, moved, files };
}
export async function runShowcaseSeed(opts) {
    const { password, superAdminEmail = 'superadmin@zobixsolutions.com', reset = false, historyDays = 70, futureDays = 3, seed = 2026, placeholderPrices = false, replace = false } = opts;
    if (replace && !reset) {
        const removed = await removeShowcaseStores();
        logger.warn('Showcase stores removed before loading them again', { ...removed });
    }
    if (reset) {
        const all = [Booking, Payment, PricingRule, PromoCode, Station, GamingCategory, BusinessSettings, Business, User, SystemSetting, Counter, CustomerNote, Review, Notification, AuditLog];
        await Promise.all(all.map((m) => m.deleteMany({})));
        logger.warn('Existing data removed (--reset)');
    }
    const passwordHash = await hashPassword(password);
    await SystemSetting.updateOne({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true });
    const superAdmin = await User.findOneAndUpdate({ email: superAdminEmail }, { $setOnInsert: { name: 'Zobix Super Admin', email: superAdminEmail, passwordHash, role: 'SUPER_ADMIN', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
    const customers = [];
    for (const [i, name] of ALL_CUSTOMER_NAMES.entries()) {
        const email = `${name.toLowerCase().replace(/\s+/g, '.')}@customer.demo`;
        const doc = await User.findOneAndUpdate({ email }, { $setOnInsert: { name, email, phone: `+92300${String(2000000 + i * 137)}`, passwordHash, role: 'CUSTOMER', isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
        customers.push({ _id: doc._id, name });
    }
    const today = DateTime.now().setZone(TZ).startOf('day');
    const nowMs = Date.now();
    const summary = [];
    const receipt = sampleReceiptPng();
    for (const [storeIndex, def] of SHOWCASE_STORES.entries()) {
        if (await Business.exists({ $or: [{ slug: def.slug }, { bookingPrefix: def.bookingPrefix }] })) {
            logger.info(`Store "${def.name}" (or its booking prefix) already exists, skipping`);
            continue;
        }
        const rand = rng(seed + storeIndex * 101);
        const pick = (list) => list[Math.floor(rand() * list.length)];
        const onRequest = !def.pricesPublished && !placeholderPrices;
        const business = await Business.create({
            name: def.name,
            slug: def.slug,
            bookingPrefix: def.bookingPrefix,
            city: 'Karachi',
            country: 'Pakistan',
            description: def.description,
            ...(def.address && { address: def.address }),
            phone: def.phone,
            whatsapp: whatsappDigits(def.phone),
            email: def.admin.email,
            timezone: TZ,
            currency: 'PKR',
            openingTime: def.opening,
            closingTime: def.closing,
            subscriptionStatus: 'ACTIVE',
            bankDetails: { bankName: 'Demo Bank', accountTitle: def.name, accountNumber: '0000-0000000-0', iban: 'PK00DEMO0000000000000000', instructions: 'Send the receipt screenshot after the transfer.' },
            createdBy: superAdmin._id,
        });
        await BusinessSettings.create({ businessId: business._id, taxPercent: 0, noShowGraceMinutes: def.noShowGraceMinutes, ...(def.maxBookingMinutes && { maximumBookingMinutes: def.maxBookingMinutes }) });
        const admin = await User.findOneAndUpdate({ email: def.admin.email }, { $setOnInsert: { name: def.admin.name, email: def.admin.email, passwordHash, role: 'STORE_ADMIN', businessIds: [business._id], isEmailVerified: true } }, { upsert: true, returnDocument: 'after' });
        // Categories, stations and prices.
        const stations = [];
        const rulesByCategory = new Map();
        let order = 0;
        for (const entry of def.categories) {
            const base = CATEGORY_CATALOG[entry.base];
            const cat = {
                name: entry.name ?? base.name,
                icon: entry.icon ?? base.icon,
                prefix: entry.prefix ?? base.prefix,
                pricePerHour: entry.pricePerHour ?? base.pricePerHour,
                capacity: entry.capacity ?? base.capacity,
                features: entry.features ?? [...base.features],
            };
            const category = await GamingCategory.create({ businessId: business._id, name: cat.name, slug: slugify(cat.name), icon: cat.icon, displayOrder: order++, priceOnRequest: onRequest });
            const made = await Station.insertMany(Array.from({ length: entry.count }, (_, i) => ({
                businessId: business._id,
                categoryId: category._id,
                name: entry.stationName ? entry.stationName(i) : `${cat.name} ${i + 1}`,
                code: `${cat.prefix}-${String(i + 1).padStart(2, '0')}`,
                capacity: cat.capacity,
                features: cat.features,
                ...(entry.note && { adminNote: entry.note }), // private to the store's team: customers never see it
            })));
            for (const s of made)
                stations.push({ _id: s._id, categoryId: category._id, code: s.code });
            const rules = onRequest ? [] : await PricingRule.insertMany([
                { businessId: business._id, categoryId: category._id, name: def.pricesPublished ? `${cat.name} standard` : `${cat.name} placeholder rate (not published: confirm with the store)`, ruleType: 'NORMAL', pricePerHour: cat.pricePerHour, priority: 0 },
                ...(entry.flatPrice
                    ? []
                    : [
                        { businessId: business._id, categoryId: category._id, name: `${cat.name} evening peak`, ruleType: 'PEAK', startTime: '18:00', endTime: '23:59', multiplier: 1.25, priority: 10 },
                        { businessId: business._id, categoryId: category._id, name: `${cat.name} weekend`, ruleType: 'WEEKEND', daysOfWeek: [5, 6], multiplier: 1.15, priority: 5 },
                    ]),
            ]);
            rulesByCategory.set(String(category._id), rules.map((r) => r.toObject()));
        }
        await PromoCode.create({ businessId: business._id, code: def.promo, discountType: 'PERCENTAGE', value: 10, maximumDiscount: 500, minimumAmount: 300 });
        // Trading history, today and the days ahead.
        const bookingDocs = [];
        const paymentDocs = [];
        const seqByDay = new Map();
        let promoUses = 0;
        let receiptsLeft = 3; // transfer receipts waiting for the admin to approve
        const proofKey = storeKey(def.slug, 'payments', 'png');
        await storage.put(proofKey, receipt);
        for (let offset = -historyDays; offset <= futureDays; offset++) {
            const day = today.plus({ days: offset });
            const date = day.toFormat('yyyy-MM-dd');
            const dow = day.weekday % 7; // 0 = Sunday, like the pricing rules
            const weekendLift = dow === 5 || dow === 6 || dow === 0 ? 1.35 : 1;
            const base = Math.min(0.9, def.busyness * weekendLift);
            const openMinutes = minutesOf(def.opening);
            const hours = spanHours(def);
            for (const st of stations) {
                let offset_ = 0;
                while (offset_ < hours) {
                    // A business day starts at opening time and, for a store open past midnight, runs into the next morning.
                    const startLocal = day.startOf('day').plus({ minutes: openMinutes, hours: offset_ });
                    const hour = startLocal.hour;
                    const chance = Math.min(0.95, base * hourWeight(hour));
                    if (rand() > chance) {
                        offset_ += 1;
                        continue;
                    }
                    const length = Math.min(hours - offset_, rand() < 0.55 ? 1 : rand() < 0.7 ? 2 : 3);
                    const startDateTime = startLocal.toUTC().toJSDate();
                    const endDateTime = new Date(startDateTime.getTime() + length * 3_600_000);
                    const startTime = startLocal.toFormat('HH:mm');
                    const endTime = DateTime.fromJSDate(endDateTime, { zone: TZ }).toFormat('HH:mm');
                    const priced = onRequest ? { baseAmount: 0 } : priceBooking(rulesByCategory.get(String(st.categoryId)), { start: startDateTime, durationMinutes: length * 60, timezone: TZ });
                    const useLoyalCode = priced.baseAmount >= 300 && rand() < 0.1;
                    const discount = useLoyalCode ? Math.min(500, roundMoney(priced.baseAmount * 0.1)) : 0;
                    const total = roundMoney(priced.baseAmount - discount);
                    const method = onRequest || rand() < 0.5 ? 'PAY_AT_VENUE' : rand() < 0.5 ? 'BANK_TRANSFER' : 'ONLINE';
                    const customer = customers[Math.floor(rand() ** 1.8 * customers.length)]; // a few regulars book most
                    const past = endDateTime.getTime() <= nowMs;
                    const live = !past && startDateTime.getTime() <= nowMs;
                    let status;
                    if (past) {
                        const r = rand();
                        status = r < 0.82 ? 'COMPLETED' : r < 0.92 ? 'CANCELLED' : 'NO_SHOW';
                    }
                    else if (live)
                        status = 'CHECKED_IN';
                    else if (method === 'BANK_TRANSFER' && rand() < 0.45)
                        status = 'PENDING';
                    else
                        status = rand() < 0.05 ? 'CANCELLED' : 'CONFIRMED';
                    // What has been paid so far.
                    let paymentStatus = 'PENDING';
                    let withProof = false;
                    if (status === 'COMPLETED')
                        paymentStatus = 'PAID';
                    else if (status === 'CHECKED_IN')
                        paymentStatus = method === 'PAY_AT_VENUE' ? 'PENDING' : 'PAID';
                    else if (status === 'CONFIRMED')
                        paymentStatus = method === 'PAY_AT_VENUE' ? 'PENDING' : 'PAID';
                    else if (status === 'PENDING') {
                        withProof = receiptsLeft > 0 && rand() < 0.7;
                        if (withProof)
                            receiptsLeft--;
                    }
                    else if (status === 'NO_SHOW')
                        paymentStatus = method !== 'PAY_AT_VENUE' && rand() < 0.5 ? 'PAID' : 'FAILED';
                    if (onRequest)
                        paymentStatus = 'PENDING'; // nothing was priced, so nothing was paid
                    const bookedAhead = (1 + Math.floor(rand() * 5)) * 86_400_000;
                    const createdAt = new Date(Math.min(startDateTime.getTime() - 3_600_000, nowMs) - bookedAhead * (past ? 1 : 0.2));
                    const compact = compactDate(date);
                    const seq = (seqByDay.get(compact) ?? 0) + 1;
                    seqByDay.set(compact, seq);
                    const _id = new Types.ObjectId();
                    if (useLoyalCode && status !== 'CANCELLED')
                        promoUses++;
                    bookingDocs.push({
                        _id,
                        businessId: business._id,
                        bookingNumber: `${def.bookingPrefix}-${compact}-${String(seq).padStart(4, '0')}`,
                        customerId: customer._id,
                        stationId: st._id,
                        categoryId: st.categoryId,
                        bookingDate: date,
                        startTime,
                        endTime,
                        startDateTime,
                        endDateTime,
                        durationMinutes: length * 60,
                        numberOfPlayers: 1,
                        overtimeMinutes: 0,
                        ...(useLoyalCode && { promoCode: def.promo }),
                        baseAmount: priced.baseAmount,
                        discountAmount: discount,
                        taxAmount: 0,
                        totalAmount: total,
                        paymentStatus: status === 'CANCELLED' ? 'PENDING' : paymentStatus,
                        amountPaid: paymentStatus === 'PAID' && status !== 'CANCELLED' ? total : 0,
                        paymentMethod: method,
                        bookingStatus: status,
                        ...(status === 'COMPLETED' && { checkedInAt: startDateTime, checkedOutAt: endDateTime }),
                        ...(status === 'CHECKED_IN' && { checkedInAt: startDateTime }),
                        ...(status === 'CANCELLED' && { cancelledAt: new Date(Math.max(createdAt.getTime(), startDateTime.getTime() - 5 * 3_600_000)), cancelledBy: customer._id, cancellationReason: pick(['Change of plans', 'Friends could not make it', 'Booked by mistake']) }),
                        ...(status === 'NO_SHOW' && { noShowReason: 'Customer did not arrive' }),
                        scheduledAt: createdAt,
                        remindersSent: [],
                        source: rand() < 0.2 ? 'WALK_IN' : 'ONLINE',
                        createdBy: customer._id,
                        createdAt,
                        updatedAt: createdAt,
                    });
                    if (status !== 'CANCELLED' && !onRequest) {
                        paymentDocs.push({
                            _id: new Types.ObjectId(),
                            bookingId: _id,
                            businessId: business._id,
                            customerId: customer._id,
                            amount: total,
                            method,
                            status: paymentStatus,
                            ...(method === 'BANK_TRANSFER' && withProof && { proofImage: proofKey, proofUploadedAt: new Date(nowMs - Math.floor(rand() * 20) * 3_600_000), transactionReference: `TRX${Math.floor(100000 + rand() * 899999)}` }),
                            ...(paymentStatus === 'PAID' && { paidAt: status === 'CONFIRMED' ? createdAt : endDateTime }),
                            ...(paymentStatus === 'PAID' && method !== 'ONLINE' && { approvedBy: admin._id }),
                            ...(paymentStatus === 'FAILED' && { rejectionReason: 'No-show' }),
                            createdAt,
                            updatedAt: createdAt,
                        });
                    }
                    offset_ += length;
                }
            }
        }
        // Whatever time the demo is given, the live board should have people playing. Top the floor up to about 40% of the
        // stations "in use" now, with sessions squeezed into the gap each station has around now.
        {
            const isHeld = (b) => b.bookingStatus !== 'CANCELLED' && b.bookingStatus !== 'NO_SHOW';
            const sessionStart = Math.floor((nowMs - 30 * 60_000) / 1_800_000) * 1_800_000; // on the half hour, 30 to 60 minutes ago
            const sessionEnd = sessionStart + 2 * 3_600_000;
            const overlaps = (b, from, to) => b.startDateTime.getTime() < to && b.endDateTime.getTime() > from;
            const liveNow = new Set(bookingDocs.filter((b) => isHeld(b) && overlaps(b, nowMs, nowMs + 1)).map((b) => String(b.stationId)));
            const wanted = isOpenAt(def, new Date(sessionStart)) ? Math.ceil(stations.length * 0.4) : 0; // a closed store has nobody playing
            for (const st of stations) {
                if (liveNow.size >= wanted)
                    break;
                if (liveNow.has(String(st._id)))
                    continue;
                // The session runs from up to an hour ago to up to an hour ahead, squeezed into the gap this station has around now.
                const held = bookingDocs.filter((b) => String(b.stationId) === String(st._id) && isHeld(b));
                const lo = Math.max(sessionStart, ...held.map((b) => b.endDateTime.getTime()).filter((t) => t <= nowMs));
                const hi = Math.min(sessionEnd, ...held.map((b) => b.startDateTime.getTime()).filter((t) => t >= nowMs));
                if (hi - lo < 3_600_000 || lo > nowMs || hi <= nowMs)
                    continue;
                const minutes = (hi - lo) / 60_000;
                const startLocal = DateTime.fromMillis(lo, { zone: TZ });
                // A session in the small hours of a store open past midnight still belongs to the previous business day.
                const pastMidnight = minutesOf(def.closing) <= minutesOf(def.opening) && startLocal.hour * 60 + startLocal.minute < minutesOf(def.opening);
                const businessDay = pastMidnight ? startLocal.minus({ days: 1 }) : startLocal;
                const date = businessDay.toFormat('yyyy-MM-dd');
                const compact = compactDate(date);
                const seq = (seqByDay.get(compact) ?? 0) + 1;
                seqByDay.set(compact, seq);
                const priced = onRequest ? { baseAmount: 0 } : priceBooking(rulesByCategory.get(String(st.categoryId)), { start: new Date(lo), durationMinutes: minutes, timezone: TZ });
                const customer = customers[Math.floor(rand() ** 1.8 * customers.length)];
                const method = onRequest || rand() < 0.6 ? 'PAY_AT_VENUE' : 'ONLINE';
                const paid = method === 'ONLINE';
                const _id = new Types.ObjectId();
                const createdAt = new Date(lo - 86_400_000);
                bookingDocs.push({
                    _id,
                    businessId: business._id,
                    bookingNumber: `${def.bookingPrefix}-${compact}-${String(seq).padStart(4, '0')}`,
                    customerId: customer._id,
                    stationId: st._id,
                    categoryId: st.categoryId,
                    bookingDate: date,
                    startTime: startLocal.toFormat('HH:mm'),
                    endTime: DateTime.fromMillis(hi, { zone: TZ }).toFormat('HH:mm'),
                    startDateTime: new Date(lo),
                    endDateTime: new Date(hi),
                    durationMinutes: minutes,
                    numberOfPlayers: 1,
                    overtimeMinutes: 0,
                    baseAmount: priced.baseAmount,
                    discountAmount: 0,
                    taxAmount: 0,
                    totalAmount: priced.baseAmount,
                    paymentStatus: paid ? 'PAID' : 'PENDING',
                    amountPaid: paid ? priced.baseAmount : 0,
                    paymentMethod: method,
                    bookingStatus: 'CHECKED_IN',
                    checkedInAt: new Date(lo),
                    scheduledAt: createdAt,
                    remindersSent: [],
                    source: 'ONLINE',
                    createdBy: customer._id,
                    createdAt,
                    updatedAt: createdAt,
                });
                if (!onRequest)
                    paymentDocs.push({ _id: new Types.ObjectId(), bookingId: _id, businessId: business._id, customerId: customer._id, amount: priced.baseAmount, method, status: paid ? 'PAID' : 'PENDING', ...(paid && { paidAt: createdAt }), createdAt, updatedAt: createdAt });
                liveNow.add(String(st._id));
            }
        }
        for (let i = 0; i < bookingDocs.length; i += 1000)
            await Booking.collection.insertMany(bookingDocs.slice(i, i + 1000), { ordered: false });
        for (let i = 0; i < paymentDocs.length; i += 1000)
            await Payment.collection.insertMany(paymentDocs.slice(i, i + 1000), { ordered: false });
        // The booking-number counters carry on from where the history stopped, so new bookings never collide with it.
        await Counter.bulkWrite([...seqByDay].map(([day, seq]) => ({ updateOne: { filter: { _id: `booking:${String(business._id)}:${day}` }, update: { $set: { seq } }, upsert: true } })));
        if (promoUses)
            await PromoCode.updateOne({ businessId: business._id, code: def.promo }, { $set: { usedCount: promoUses } });
        summary.push({ store: def.name, phone: def.phone, admin: def.admin.email, stations: stations.length, bookings: bookingDocs.length, priceOnRequest: onRequest });
    }
    return { superAdminEmail, stores: summary };
}
//# sourceMappingURL=showcaseData.js.map