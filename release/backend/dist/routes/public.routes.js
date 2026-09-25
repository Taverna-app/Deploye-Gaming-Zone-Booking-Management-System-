import { Router } from 'express';
import * as publicController from '../controllers/public.controller.js';
import * as availabilityController from '../controllers/availability.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import { listPublicReviewsQuerySchema } from '../validators/review.validator.js';
import { validate } from '../middleware/validation.middleware.js';
import { quoteLimiter } from '../middleware/rateLimit.middleware.js';
import { availabilityQuerySchema, quoteSchema, listPublicBusinessesQuerySchema, publicStationsQuerySchema, slugParamSchema, } from '../validators/public.validator.js';
/** Unauthenticated, read-only. Only ACTIVE stores are visible; responses use field allow-lists. */
export const publicRouter = Router();
const slug = validate(slugParamSchema, 'params');
publicRouter.get('/businesses', validate(listPublicBusinessesQuerySchema, 'query'), publicController.listBusinesses);
publicRouter.get('/businesses/:slug', slug, publicController.getBusiness);
publicRouter.get('/businesses/:slug/categories', slug, publicController.listCategories);
publicRouter.get('/businesses/:slug/stations', slug, validate(publicStationsQuerySchema, 'query'), publicController.listStations);
publicRouter.get('/businesses/:slug/reviews', slug, validate(listPublicReviewsQuerySchema, 'query'), reviewController.listPublic);
publicRouter.get('/businesses/:slug/availability', slug, validate(availabilityQuerySchema, 'query'), availabilityController.availability);
publicRouter.post('/businesses/:slug/quote', quoteLimiter, slug, validate(quoteSchema), availabilityController.quote);
//# sourceMappingURL=public.routes.js.map