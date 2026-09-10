import { and, desc, eq, getTableColumns } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { TRANSACTION_SORT } from "@transaction-dispute-portal/shared";
import type { TransactionSort, TransactionsQuery } from "@transaction-dispute-portal/shared";

import { TransactionModel } from "../schema/index.js";
import type { TransactionModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";
import {
	containsText,
	sortDirection,
	withinDays,
	type Page,
} from "./list-filters.js";

/**
 * Binds each value the shared `TRANSACTION_SORT` whitelist allows to its Drizzle
 * column — the one piece that can't live in `shared`, since it references the
 * table. The `Record` type makes the map track the whitelist: adding a sort key
 * without a column here is a type error. `transacted_at` is the default.
 */
const SORT_COLUMN: Record<TransactionSort, PgColumn> = {
	[TRANSACTION_SORT.transacted_at]: TransactionModel.transacted_at,
	[TRANSACTION_SORT.merchant]: TransactionModel.merchant_name,
	[TRANSACTION_SORT.amount_cents]: TransactionModel.amount_cents,
};

/**
 * The customer path never selects `user_id` (always the caller) — excluded
 * from the query itself, derived from the table so it follows schema changes.
 */
const { user_id, ...CUSTOMER_COLUMNS } = getTableColumns(TransactionModel);

export type TransactionRow = Omit<TransactionModelSelect, "user_id">;

/** The validated list query, scoped to the caller. */
type FindManyOptions = TransactionsQuery & { userId: string };

/**
 * One page of a user's transactions plus the full match count. `search` matches
 * the merchant name; `from` / `to` bound `transacted_at`; `sort` / `order` pick
 * the column and direction (`transacted_at` descending by default).
 */
export const findTransactionsByUser = async (
	executor: Executor,
	options: FindManyOptions,
): Promise<Page<TransactionRow>> => {
	const where = and(
		eq(TransactionModel.user_id, options.userId),
		options.search
			? containsText(options.search, TransactionModel.merchant_name)
			: undefined,
		withinDays(TransactionModel.transacted_at, options.from, options.to),
	);

	const direction = sortDirection(options.order);
	const sortColumn =
		SORT_COLUMN[options.sort ?? TRANSACTION_SORT.transacted_at];

	const [rows, total] = await Promise.all([
		executor
			.select(CUSTOMER_COLUMNS)
			.from(TransactionModel)
			.where(where)
			.orderBy(direction(sortColumn), desc(TransactionModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.$count(TransactionModel, where),
	]);

	return { rows, total };
};

/** A single transaction, but only if it belongs to `userId` — otherwise `undefined`. */
export const findUserTransactionById = async (
	executor: Executor,
	options: { id: string; userId: string },
): Promise<TransactionRow | undefined> => {
	const [row] = await executor
		.select(CUSTOMER_COLUMNS)
		.from(TransactionModel)
		.where(
			and(
				eq(TransactionModel.id, options.id),
				eq(TransactionModel.user_id, options.userId),
			),
		)
		.limit(1);

	return row;
};
