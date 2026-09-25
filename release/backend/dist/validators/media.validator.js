import { z } from 'zod';
import { IMAGE_KINDS, ITEM_TARGETS } from '../services/media.service.js';
import { objectId } from './common.validator.js';
export const imageKindParamsSchema = z.object({ kind: z.enum(IMAGE_KINDS) });
export const itemImageParamsSchema = z.object({ target: z.enum(ITEM_TARGETS), id: objectId });
//# sourceMappingURL=media.validator.js.map