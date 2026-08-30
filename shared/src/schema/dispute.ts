import { z } from "zod";

import {
	DEFAULT_PAGE_LIMIT,
	DEFAULT_PAGE_NUMBER,
	MAX_PAGE_LIMIT,
	ORDER_DIRECTION,
} from "../constant.js";

import {
	disputeReasonSchema,
	disputeStatusSchema,
	orderDirectionSchema,
	stringSchema,
	uuidSchema,
} from "./field.js";
import {
	globalResponseSchema,
	paginatedGlobalResponseSchema,
} from "./global.js";

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
 * Query for `GET /v1/disputes` — a page of the caller's disputes, newest first,
 * optionally narrowed to a single status. `page` / `limit` are coerced from
 * their string query form.
 */
export const disputesQuerySchema = z.object({
	status: disputeStatusSchema
		.optional()
		.describe("Only disputes currently in this status"),
	order: orderDirectionSchema
		.default(ORDER_DIRECTION.desc)
		.describe("Sort direction on created_at"),
	page: z.coerce
		.number()
		.int()
		.positive()
		.default(DEFAULT_PAGE_NUMBER)
		.describe("1-based page number"),
	limit: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_PAGE_LIMIT)
		.default(DEFAULT_PAGE_LIMIT)
		.describe("Items per page"),
});

/**
 * One dispute on the wire. Field names mirror the `dispute` table's columns
 * (`docs/decisions.md` #30) so there is no rename layer; timestamps are ISO
 * 8601 strings. `user_id` is omitted — it is always the caller.
 */
export const disputeSchema = z.object({
	id: uuidSchema,
	transaction_id: uuidSchema,
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
