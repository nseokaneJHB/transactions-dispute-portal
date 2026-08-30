import { z } from "zod";

import { integerSchema, serverStatusSchema } from "./field.js";
import { globalResponseSchema } from "./global.js";

export const healthzResponseSchema = globalResponseSchema.extend({
	data: z.object({
		health: serverStatusSchema.describe("Overall server health status"),
	}),
});

export const readyzResponseSchema = globalResponseSchema.extend({
	data: z.object({
		uptimeSeconds: integerSchema.describe(
			"Seconds elapsed since the process started",
		),
	}),
});
