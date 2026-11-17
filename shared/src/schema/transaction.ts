import { z } from "zod";

import { TRANSACTION_SORT } from "../constant.js";

import { integerSchema, stringSchema, uuidSchema } from "./field.js";
import {
	amountRangeQueryShape,
	CURSOR_ORDER_ISSUE,
	globalResponseSchema,
	isCursorForOrder,
	isOrderedAmountRange,
	isOrderedDateRange,
	ORDERED_AMOUNT_RANGE_ISSUE,
	ORDERED_DATE_RANGE_ISSUE,
	paginatedGlobalResponseSchema,
	paginationQuerySchema,
	seekIntegerSchema,
	seekTextSchema,
	seekTimestampSchema,
} from "./global.js";

/** The sort value a transactions `cursor` carries, per `sort`. */
const TRANSACTION_SEEK_VALUES: Record<keyof typeof TRANSACTION_SORT, z.ZodType> =
	{
		[TRANSACTION_SORT.transacted_at]: z.tuple([seekTimestampSchema]),
		[TRANSACTION_SORT.merchant]: z.tuple([seekTextSchema]),
		[TRANSACTION_SORT.amount_cents]: z.tuple([seekIntegerSchema]),
	};

/**
 * Query for `GET /v1/transactions` — a page of the caller's transactions.
 * `search` matches the merchant name; `from` / `to` bound `transacted_at`;
 * `min_amount_cents` / `max_amount_cents` bound the amount; `sort` picks the
 * column (`order` its direction); `cursor` seeks to a neighbouring page of
 * that ordering.
 */
export const transactionsQuerySchema = paginationQuerySchema
	.extend({
		...amountRangeQueryShape,
		sort: z
			.enum(TRANSACTION_SORT)
			.optional()
			.describe("Column to sort the page by — defaults to `transacted_at`"),
	})
	.refine(isOrderedDateRange, ORDERED_DATE_RANGE_ISSUE)
	.refine(isOrderedAmountRange, ORDERED_AMOUNT_RANGE_ISSUE)
	.refine(
		isCursorForOrder(TRANSACTION_SEEK_VALUES, TRANSACTION_SORT.transacted_at),
		CURSOR_ORDER_ISSUE,
	);

/**
 * One transaction on the wire. Field names mirror the `transaction` table's
 * columns (`docs/progress-and-decisions.md` #30) so there is no rename layer; timestamps
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
