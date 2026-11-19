import { z } from "zod";

import { CURSOR_DIRECTION } from "../constant.js";
import {
	globalResponseSchema,
	seekPositionSchema,
} from "../schema/global.js";

export type GlobalResponse = z.infer<typeof globalResponseSchema>;

export type CursorDirection =
	(typeof CURSOR_DIRECTION)[keyof typeof CURSOR_DIRECTION];

export type SeekPosition = z.infer<typeof seekPositionSchema>;
