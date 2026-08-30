import { z } from "zod";

import {
	DEFAULT_PAGE_LIMIT,
	DEFAULT_PAGE_NUMBER,
	MAX_PAGE_LIMIT,
	ORDER_DIRECTION,
} from "../constant.js";

import {
	integerSchema,
	orderDirectionSchema,
	stringSchema,
	uuidSchema,
} from "./field.js";
import {
	globalResponseSchema,
	paginatedGlobalResponseSchema,
} from "./global.js";

/**
 * Query for `GET /v1/transactions` — a page of the caller's transactions,
 * optionally bounded by a `transacted_at` date range and ordered on that
 * column. `page` / `limit` are coerced from their string query form.
 */
export const transactionsQuerySchema = z
	.object({
		from: z.iso
			.date()
			.optional()
			.describe("Earliest transaction date, inclusive (YYYY-MM-DD)"),
		to: z.iso
			.date()
			.optional()
			.describe("Latest transaction date, inclusive (YYYY-MM-DD)"),
		order: orderDirectionSchema
			.default(ORDER_DIRECTION.desc)
			.describe("Sort direction on transacted_at"),
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
	})
	.refine((query) => !query.from || !query.to || query.from <= query.to, {
		path: ["from"],
		message: "`from` must be on or before `to`",
	});

/**
 * One transaction on the wire. Field names mirror the `transaction` table's
 * columns (`docs/decisions.md` #30) so there is no rename layer; timestamps
 * are ISO 8601 strings.
 */
export const transactionSchema = z.object({
	id: uuidSchema,
	amount_cents: integerSchema.describe("Amount in ZAR cents"),
	merchant_name: stringSchema.describe("Merchant the payment was made to"),
	transacted_at: stringSchema.describe("When the payment happened (ISO 8601)"),
	created_at: stringSchema.describe("When the record was created (ISO 8601)"),
	updated_at: stringSchema.describe("When the record last changed (ISO 8601)"),
});

/** Response for `GET /v1/transactions/:transactionId`. */
export const transactionResponseSchema = globalResponseSchema.extend({
	data: transactionSchema,
});

/** Response for `GET /v1/transactions` — one page of transactions. */
export const transactionListResponseSchema =
	paginatedGlobalResponseSchema.extend({
		data: z.array(transactionSchema),
	});
