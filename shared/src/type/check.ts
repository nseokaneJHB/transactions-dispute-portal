import { z } from "zod";

import {
	healthzResponseSchema,
	readyzResponseSchema,
} from "../schema/check.js";

export type HealthzResponse = z.infer<typeof healthzResponseSchema>;

export type ReadyzResponse = z.infer<typeof readyzResponseSchema>;
