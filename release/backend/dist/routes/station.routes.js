import { Router } from 'express';
import * as controller from '../controllers/station.controller.js';
import * as adminBookingController from '../controllers/adminBooking.controller.js';
import { authorize } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createStationSchema, listStationsQuerySchema, updateStationSchema } from '../validators/station.validator.js';
export const stationRouter = Router();
const manage = authorize('STORE_ADMIN', 'SUPER_ADMIN');
const params = validate(idParamSchema, 'params');
// Staff can view stations and their status; only admins change them.
stationRouter.get('/', validate(listStationsQuerySchema, 'query'), controller.list);
stationRouter.get('/live', adminBookingController.liveBoard); // before /:id so "live" is not read as an id
stationRouter.get('/:id', params, controller.get);
stationRouter.post('/', manage, validate(createStationSchema), controller.create);
stationRouter.put('/:id', manage, params, validate(updateStationSchema), controller.update);
stationRouter.delete('/:id', manage, params, controller.remove);
//# sourceMappingURL=station.routes.js.map