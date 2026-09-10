import { z } from "zod";

import {
	disputeReasonSchema,
	disputeResolutionSchema,
	disputeStatusSchema,
	emailSchema,
	integerSchema,
	stringSchema,
	uuidSchema,
} from "./field.js";
import {
	globalResponseSchema,
	isOrderedDateRange,
	ORDERED_DATE_RANGE_ISSUE,
	paginatedGlobalResponseSchema,
	paginationQuerySchema,
} from "./global.js";
import { ADMIN_DISPUTE_SORT, DISPUTE_SORT } from "../constant.js";

/**
 * Body for `POST /v1/disputes` — open a dispute on one of the caller's own
 * transactions. At most one open dispute per transaction is enforced
 * server-side (`docs/decisions.md` #4).
 */
export const disputeCreateBodySchema = z.object({
	transactionId: uuidSchema,
	reason: disputeReasonSchema,
	description: stringSchema
		.min(1, "A description is required.")
		.max(2000, "Keep the description under 2000 characters.")
		.describe("The customer's account of what is wrong with the charge"),
});

/**
 * Shared filters for `GET /v1/disputes` and `GET /v1/admin/disputes` — status,
 * transaction, and (from `paginationQuerySchema`) `search` / `from` / `to` /
 * pagination. `search` matches the dispute description and the disputed
 * merchant, plus — on the admin route only — the customer's name and email.
 * The two routes differ only in their `sort` whitelist, so `sort` is added per
 * route below.
 */
const disputesQueryBase = paginationQuerySchema.extend({
	status: disputeStatusSchema
		.optional()
		.describe("Only disputes currently in this status"),
	transaction_id: uuidSchema
		.optional()
		.describe("Only disputes raised against this transaction"),
});

/** Query for `GET /v1/disputes` — the caller's own disputes. */
export const disputesQuerySchema = disputesQueryBase
	.extend({
		sort: z
			.enum(DISPUTE_SORT)
			.optional()
			.describe("Column to sort the page by — defaults to `created_at`"),
	})
	.refine(isOrderedDateRange, ORDERED_DATE_RANGE_ISSUE);

/**
 * Query for `GET /v1/admin/disputes` — the review queue. Same filters as
 * `disputesQuerySchema` but `sort` also accepts `customer`, since a reviewer
 * (unlike a customer looking at their own list) benefits from grouping one
 * person's disputes together.
 */
export const adminDisputesQuerySchema = disputesQueryBase
	.extend({
		sort: z
			.enum(ADMIN_DISPUTE_SORT)
			.optional()
			.describe("Column to sort the page by — defaults to `created_at`"),
	})
	.refine(isOrderedDateRange, ORDERED_DATE_RANGE_ISSUE);

/**
 * The disputed transaction's own details, carried on every dispute response so
 * a customer or reviewer can see what's actually being disputed without a
 * second lookup by `transaction_id`.
 */
export const disputeTransactionSchema = z.object({
	merchant_name: stringSchema.describe("Merchant the disputed payment was made to"),
	amount_cents: integerSchema.describe("Amount in ZAR cents"),
	transacted_at: stringSchema.describe("When the payment happened (ISO 8601)"),
});

/**
 * One dispute on the wire. Field names mirror the `dispute` table's columns
 * (`docs/decisions.md` #30) so there is no rename layer; timestamps are ISO
 * 8601 strings. `user_id` is omitted — it is always the caller.
 */
export const disputeSchema = z.object({
	id: uuidSchema,
	transaction_id: uuidSchema,
	transaction: disputeTransactionSchema,
	status: disputeStatusSchema,
	reason: disputeReasonSchema,
	description: stringSchema.describe("The customer's account of the problem"),
	resolution_note: stringSchema
		.nullable()
		.describe("The agent's note, set once the dispute is closed"),
	resolved_at: stringSchema
		.nullable()
		.describe("When the dispute was closed (ISO 8601)"),
	created_at: stringSchema.describe("When the dispute was opened (ISO 8601)"),
	updated_at: stringSchema.describe("When the dispute last changed (ISO 8601)"),
});

/** Response for `POST /v1/disputes` and `GET /v1/disputes/:disputeId`. */
export const disputeResponseSchema = globalResponseSchema.extend({
	data: disputeSchema,
});

/** Response for `GET /v1/disputes` — one page of disputes. */
export const disputeListResponseSchema = paginatedGlobalResponseSchema.extend({
	data: z.array(disputeSchema),
});

/**
 * The dispute owner's own details, carried on every admin dispute response so a
 * reviewer can see whose money they are deciding on — and spot a repeat filer —
 * without a second lookup by `user_id`.
 */
export const disputeCustomerSchema = z.object({
	name: stringSchema.describe("The customer's name"),
	email: emailSchema.describe("The customer's sign-in email"),
});

/**
 * One dispute on the admin wire — the customer shape plus `user_id` and the
 * owning customer's `name` / `email`, since a reviewer is not the owner and
 * needs to know whose dispute it is.
 */
export const adminDisputeSchema = disputeSchema.extend({
	user_id: uuidSchema.describe("The customer who opened the dispute"),
	customer: disputeCustomerSchema,
});

/**
 * Body for `POST /v1/admin/disputes/:disputeId/resolve` — the reviewer's
 * decision (`RESOLVED` / `REJECTED`) plus the note shown to the customer.
 * Only reachable from an open dispute; a closed one is a `409`.
 */
export const disputeResolveBodySchema = z.object({
	resolution: disputeResolutionSchema,
	note: stringSchema
		.min(1, "A resolution note is required.")
		.max(2000, "Keep the note under 2000 characters.")
		.describe("The reviewer's explanation, recorded on the dispute and its audit log"),
});

/** Response for `POST /v1/admin/disputes/:disputeId/resolve`. */
export const adminDisputeResponseSchema = globalResponseSchema.extend({
	data: adminDisputeSchema,
});

/** Response for `GET /v1/admin/disputes` — one page of disputes for review. */
export const adminDisputeListResponseSchema = paginatedGlobalResponseSchema.extend({
	data: z.array(adminDisputeSchema),
});

/**
 * A live count of every dispute in each lifecycle status — unfiltered, the
 * whole picture for the review-queue stat cards. Every status key is present,
 * `0` included.
 */
export const disputeStatusCountsSchema = z
	.record(disputeStatusSchema, integerSchema)
	.describe("Count of disputes in each status");

/** Response for `GET /v1/admin/disputes/summary`. */
export const adminDisputeSummaryResponseSchema = globalResponseSchema.extend({
	data: disputeStatusCountsSchema,
});
