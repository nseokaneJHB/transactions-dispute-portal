import { z } from "zod";

import {
	ADMIN_DISPUTE_SORT,
	ADMIN_INVITE_SORT,
	DISPUTE_SORT,
	TRANSACTION_SORT,
} from "../constant.js";

import {
	roleSchema,
	orderDirectionSchema,
	uuidParamsSchema,
	disputeStatusSchema,
	disputeReasonSchema,
	disputeResolutionSchema,
	adminInviteStatusSchema,
} from "../schema/field.js";

export type Role = z.infer<typeof roleSchema>;

export type OrderDirection = z.infer<typeof orderDirectionSchema>;

export type DisputeStatus = z.infer<typeof disputeStatusSchema>;

export type DisputeReason = z.infer<typeof disputeReasonSchema>;

export type DisputeResolution = z.infer<typeof disputeResolutionSchema>;

export type AdminInviteStatus = z.infer<typeof adminInviteStatusSchema>;

export type TransactionSort =
	(typeof TRANSACTION_SORT)[keyof typeof TRANSACTION_SORT];

export type DisputeSort = (typeof DISPUTE_SORT)[keyof typeof DISPUTE_SORT];

export type AdminDisputeSort =
	(typeof ADMIN_DISPUTE_SORT)[keyof typeof ADMIN_DISPUTE_SORT];

export type AdminInviteSort =
	(typeof ADMIN_INVITE_SORT)[keyof typeof ADMIN_INVITE_SORT];

/** Params for a detail route keyed by a single UUID, e.g. `UuidParams<"transactionId">`. */
export type UuidParams<Key extends string> = z.infer<
	ReturnType<typeof uuidParamsSchema<Key>>
>;
