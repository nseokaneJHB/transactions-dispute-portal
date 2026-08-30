import { z } from "zod";

import { roleSchema, serverStatusSchema } from "../schema/field.js";

export type Role = z.infer<typeof roleSchema>;

export type ServerStatus = z.infer<typeof serverStatusSchema>;
