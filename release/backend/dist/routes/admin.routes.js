import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';
import { requireTenant, tenantGuard } from '../middleware/tenant.middleware.js';
import { categoryRouter } from './category.routes.js';
import { stationRouter } from './station.routes.js';
import { pricingRouter } from './pricing.routes.js';
import { adminPaymentRouter } from './adminPayment.routes.js';
import { validate } from '../middleware/validation.middleware.js';
import { updateSettingsBodySchema } from '../validators/settings.validator.js';
import * as storeController from '../controllers/adminStore.controller.js';
import * as mediaController from '../controllers/adminMedia.controller.js';
import { uploadImage } from '../middleware/upload.middleware.js';
import { uploadLimiter } from '../middleware/rateLimit.middleware.js';
import { imageKindParamsSchema, itemImageParamsSchema } from '../validators/media.validator.js';
import { reviewAdminRouter } from './adminReview.routes.js';
import { customerAdminRouter } from './adminCustomer.routes.js';
import { reportRouter } from './report.routes.js';
import { promoRouter, staffRouter } from './adminTeam.routes.js';
import { adminBookingRouter, adminCalendarRouter } from './adminBooking.routes.js';
/**
 * Everything under /api/admin is tenant-scoped. `tenantGuard` derives the business from the
 * authenticated user (never from the body), and `requireTenant` makes sure one was resolved.
 * A SUPER_ADMIN reaches a store by sending X-Business-Id.
 */
export const adminRouter = Router();
adminRouter.use(authenticate, authorize('STORE_ADMIN', 'STAFF', 'SUPER_ADMIN'), tenantGuard, requireTenant);
adminRouter.get('/store', storeController.context);
// Store settings (including bank details) are for store admins; desk staff never see them.
adminRouter.get('/settings', authorize('STORE_ADMIN', 'SUPER_ADMIN'), storeController.getSettings);
adminRouter.put('/settings', authorize('STORE_ADMIN', 'SUPER_ADMIN'), validate(updateSettingsBodySchema), storeController.updateSettings);
// The store's public pictures (logo, cover): store admins only.
adminRouter.post('/media/:kind', authorize('STORE_ADMIN', 'SUPER_ADMIN'), uploadLimiter, validate(imageKindParamsSchema, 'params'), uploadImage('file'), mediaController.upload);
adminRouter.delete('/media/:kind', authorize('STORE_ADMIN', 'SUPER_ADMIN'), validate(imageKindParamsSchema, 'params'), mediaController.remove);
// A picture for a category or a station, so customers can see what they are booking.
adminRouter.post('/media/:target/:id', authorize('STORE_ADMIN', 'SUPER_ADMIN'), uploadLimiter, validate(itemImageParamsSchema, 'params'), uploadImage('file'), mediaController.uploadItem);
adminRouter.delete('/media/:target/:id', authorize('STORE_ADMIN', 'SUPER_ADMIN'), validate(itemImageParamsSchema, 'params'), mediaController.removeItem);
adminRouter.use('/categories', categoryRouter);
adminRouter.use('/stations', stationRouter);
adminRouter.use('/pricing', pricingRouter);
adminRouter.use('/payments', adminPaymentRouter);
adminRouter.use('/bookings', adminBookingRouter);
adminRouter.use('/calendar', adminCalendarRouter);
adminRouter.use('/staff', staffRouter);
adminRouter.use('/promos', promoRouter);
adminRouter.use('/reports', reportRouter);
adminRouter.use('/customers', customerAdminRouter);
adminRouter.use('/reviews', reviewAdminRouter);
//# sourceMappingURL=admin.routes.js.map