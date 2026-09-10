import { z } from "zod";

import { TRANSACTION_SORT } from "../constant.js";

import { integerSchema, stringSchema, uuidSchema } from "./field.js";
import {
	globalResponseSchema,
	isOrderedDateRange,
	ORDERED_DATE_RANGE_ISSUE,
	paginatedGlobalResponseSchema,
	paginationQuerySchema,
} from "./global.js";

/**
 * Query for `GET /v1/transactions` — a page of the caller's transactions.
 * `search` matches the merchant name; `from` / `to` bound `transacted_at`; `sort`
 * picks the column (`order` its direction). Everything but `sort` is inherited
 * from `paginationQuerySchema`.
 */
export const transactionsQuerySchema = paginationQuerySchema
	.extend({
		sort: z
			.enum(TRANSACTION_SORT)
			.optional()
			.describe("Column to sort the page by — defaults to `transacted_at`"),
	})
	.refine(isOrderedDateRange, ORDERED_DATE_RANGE_ISSUE);

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
