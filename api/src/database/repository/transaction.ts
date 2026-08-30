import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";

import { ORDER_DIRECTION } from "@transaction-dispute-portal/shared";
import type { OrderDirection } from "@transaction-dispute-portal/shared";

import { TransactionModel } from "../schema/index.js";
import type { TransactionModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";

const COLUMNS = {
	id: TransactionModel.id,
	amount_cents: TransactionModel.amount_cents,
	merchant_name: TransactionModel.merchant_name,
	transacted_at: TransactionModel.transacted_at,
	created_at: TransactionModel.created_at,
	updated_at: TransactionModel.updated_at,
} as const;

export type TransactionRow = Pick<
	TransactionModelSelect,
	keyof typeof COLUMNS
>;

interface FindManyOptions {
	userId: string;
	from?: Date;
	to?: Date;
	page: number;
	limit: number;
	order: OrderDirection;
}

interface Page<T> {
	rows: T[];
	total: number;
}

/** One page of a user's transactions, newest (or oldest) `transacted_at` first, plus the full match count. */
export const findTransactionsByUser = async (
	executor: Executor,
	options: FindManyOptions,
): Promise<Page<TransactionRow>> => {
	const where = and(
		eq(TransactionModel.user_id, options.userId),
		options.from ? gte(TransactionModel.transacted_at, options.from) : undefined,
		options.to ? lte(TransactionModel.transacted_at, options.to) : undefined,
	);

	const direction = options.order === ORDER_DIRECTION.asc ? asc : desc;

	const [rows, [tally]] = await Promise.all([
		executor
			.select(COLUMNS)
			.from(TransactionModel)
			.where(where)
			.orderBy(
				direction(TransactionModel.transacted_at),
				desc(TransactionModel.id),
			)
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor
			.select({ value: count() })
			.from(TransactionModel)
			.where(where),
	]);

	return { rows, total: tally?.value ?? 0 };
};

/** A single transaction, but only if it belongs to `userId` — otherwise `undefined`. */
export const findUserTransactionById = async (
	executor: Executor,
	options: { id: string; userId: string },
): Promise<TransactionRow | undefined> => {
	const [row] = await executor
		.select(COLUMNS)
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
