import { z } from "zod";

import { globalResponseSchema } from "../schema/global.js";

export type GlobalResponse = z.infer<typeof globalResponseSchema>;
