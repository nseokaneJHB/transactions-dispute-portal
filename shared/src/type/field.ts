import { z } from "zod";

import {
	roleSchema,
	serverStatusSchema,
	orderDirectionSchema,
	uuidParamsSchema,
	disputeStatusSchema,
	disputeReasonSchema,
	disputeResolutionSchema,
} from "../schema/field.js";

export type Role = z.infer<typeof roleSchema>;

export type ServerStatus = z.infer<typeof serverStatusSchema>;

export type OrderDirection = z.infer<typeof orderDirectionSchema>;

export type DisputeStatus = z.infer<typeof disputeStatusSchema>;

export type DisputeReason = z.infer<typeof disputeReasonSchema>;

export type DisputeResolution = z.infer<typeof disputeResolutionSchema>;

/** Params for a detail route keyed by a single UUID, e.g. `UuidParams<"transactionId">`. */
export type UuidParams<Key extends string> = z.infer<
	ReturnType<typeof uuidParamsSchema<Key>>
>;
