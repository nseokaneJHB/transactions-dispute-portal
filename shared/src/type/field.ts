import { z } from "zod";

import {
	roleSchema,
	serverStatusSchema,
	orderDirectionSchema,
} from "../schema/field.js";

export type Role = z.infer<typeof roleSchema>;

export type ServerStatus = z.infer<typeof serverStatusSchema>;

export type OrderDirection = z.infer<typeof orderDirectionSchema>;
