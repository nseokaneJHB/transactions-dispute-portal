import { and, asc, desc, eq, getTableColumns, inArray } from "drizzle-orm";

import {
	DISPUTE_STATUS,
	OPEN_DISPUTE_STATUS,
	ORDER_DIRECTION,
} from "@transaction-dispute-portal/shared";
import type {
	DisputeReason,
	DisputeResolution,
	DisputeStatus,
	OrderDirection,
} from "@transaction-dispute-portal/shared";

import { DisputeModel, TransactionModel } from "../schema/index.js";
import type { DisputeModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";

/**
 * The customer path never selects `user_id` (always the caller) or
 * `resolved_by` (internal) — excluded from the query itself, derived from the
 * table so it follows schema changes.
 */
const { user_id, resolved_by, ...CUSTOMER_COLUMNS } = getTableColumns(DisputeModel);

/**
 * The disputed transaction's own columns, joined onto every dispute read so a
 * customer or reviewer can see what's being disputed without a second lookup.
 * `transaction_id` is `NOT NULL` (`database/schema/dispute.ts`), so an inner
 * join never drops a dispute row.
 */
const TRANSACTION_SUMMARY_COLUMNS = {
	merchant_name: TransactionModel.merchant_name,
	amount_cents: TransactionModel.amount_cents,
	transacted_at: TransactionModel.transacted_at,
};

type TransactionSummary = {
	merchant_name: string;
	amount_cents: number;
	transacted_at: Date;
};

/**
 * A dispute row as it comes back from an `UPDATE`/`INSERT ... RETURNING` —
 * no joined transaction, since those statements can't join. The service layer
 * already has the transaction in hand from a prior read in every such case,
 * so it's merged in there instead of re-queried.
 */
export type DisputeMutationRow = Omit<
	DisputeModelSelect,
	"user_id" | "resolved_by"
>;

export type DisputeRow = DisputeMutationRow & { transaction: TransactionSummary };

export type AdminDisputeRow = DisputeModelSelect & {
	transaction: TransactionSummary;
};

interface FindManyOptions {
	userId: string;
	status?: DisputeStatus;
	page: number;
	limit: number;
	order: OrderDirection;
}

interface FindManyForReviewOptions {
	status?: DisputeStatus;
	page: number;
	limit: number;
	order: OrderDirection;
}

interface ResolveDisputeInput {
	id: string;
	status: DisputeResolution;
	note: string;
	resolvedBy: string;
}

interface NewDispute {
	userId: string;
	transactionId: string;
	reason: DisputeReason;
	description: string;
}

interface Page<T> {
	rows: T[];
	total: number;
}

/** One page of a user's disputes, newest (or oldest) `created_at` first, plus the full match count. */
export const findDisputesByUser = async (
	executor: Executor,
	options: FindManyOptions,
): Promise<Page<DisputeRow>> => {
	const where = and(
		eq(DisputeModel.user_id, options.userId),
		options.status ? eq(DisputeModel.status, options.status) : undefined,
	);

	const direction = options.order === ORDER_DIRECTION.asc ? asc : desc;

	const [rows, total] = await Promise.all([
		executor
			.select({ ...CUSTOMER_COLUMNS, transaction: TRANSACTION_SUMMARY_COLUMNS })
			.from(DisputeModel)
			.innerJoin(
				TransactionModel,
				eq(DisputeModel.transaction_id, TransactionModel.id),
			)
			.where(where)
			.orderBy(direction(DisputeModel.created_at), desc(DisputeModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.$count(DisputeModel, where),
	]);

	return { rows, total };
};

/**
 * A single dispute, but only if it belongs to `userId` — otherwise `undefined`.
 * Pass `lockForUpdate` inside a transaction to take a row lock, so a concurrent
 * admin transition can't change the status between this read and a follow-up
 * write (used by the withdraw path to record an accurate `from_status`).
 */
export const findUserDisputeById = async (
	executor: Executor,
	options: { id: string; userId: string },
	queryOptions: { lockForUpdate?: boolean } = {},
): Promise<DisputeRow | undefined> => {
	const query = executor
		.select({ ...CUSTOMER_COLUMNS, transaction: TRANSACTION_SUMMARY_COLUMNS })
		.from(DisputeModel)
		.innerJoin(
			TransactionModel,
			eq(DisputeModel.transaction_id, TransactionModel.id),
		)
		.where(
			and(
				eq(DisputeModel.id, options.id),
				eq(DisputeModel.user_id, options.userId),
			),
		)
		.limit(1);

	const [row] = await (queryOptions.lockForUpdate ? query.for("update") : query);

	return row;
};

/** One page of all disputes (any owner), for the admin review queue, plus the full match count. */
export const findDisputesForReview = async (
	executor: Executor,
	options: FindManyForReviewOptions,
): Promise<Page<AdminDisputeRow>> => {
	const where = options.status
		? eq(DisputeModel.status, options.status)
		: undefined;

	const direction = options.order === ORDER_DIRECTION.asc ? asc : desc;

	const [rows, total] = await Promise.all([
		executor
			.select({
				...getTableColumns(DisputeModel),
				transaction: TRANSACTION_SUMMARY_COLUMNS,
			})
			.from(DisputeModel)
			.innerJoin(
				TransactionModel,
				eq(DisputeModel.transaction_id, TransactionModel.id),
			)
			.where(where)
			.orderBy(direction(DisputeModel.created_at), desc(DisputeModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.$count(DisputeModel, where),
	]);

	return { rows, total };
};

/** A single dispute by id, unscoped — for the admin review path. `undefined` if it does not exist. */
export const findDisputeById = async (
	executor: Executor,
	options: { id: string },
): Promise<AdminDisputeRow | undefined> => {
	const [row] = await executor
		.select({
			...getTableColumns(DisputeModel),
			transaction: TRANSACTION_SUMMARY_COLUMNS,
		})
		.from(DisputeModel)
		.innerJoin(
			TransactionModel,
			eq(DisputeModel.transaction_id, TransactionModel.id),
		)
		.where(eq(DisputeModel.id, options.id))
		.limit(1);

	return row;
};

/**
 * Move a `SUBMITTED` dispute to `UNDER_REVIEW`. The current-status check is in
 * the `where` clause, not a prior read (`docs/decisions.md` #4) — a concurrent
 * call matches nothing and gets `undefined`, the caller's 409.
 */
export const markDisputeUnderReview = async (
	executor: Executor,
	options: { id: string },
): Promise<DisputeModelSelect | undefined> => {
	const [row] = await executor
		.update(DisputeModel)
		.set({ status: DISPUTE_STATUS.UNDER_REVIEW })
		.where(
			and(
				eq(DisputeModel.id, options.id),
				eq(DisputeModel.status, DISPUTE_STATUS.SUBMITTED),
			),
		)
		.returning();

	return row;
};

/**
 * Move an `UNDER_REVIEW` dispute to a terminal status, recording the note, the
 * reviewer, and the close time. Same `where`-clause guard as
 * `markDisputeUnderReview` — a concurrent resolve gets `undefined` / a 409.
 */
export const resolveDispute = async (
	executor: Executor,
	resolution: ResolveDisputeInput,
): Promise<DisputeModelSelect | undefined> => {
	const [row] = await executor
		.update(DisputeModel)
		.set({
			status: resolution.status,
			resolution_note: resolution.note,
			resolved_by: resolution.resolvedBy,
			resolved_at: new Date(),
		})
		.where(
			and(
				eq(DisputeModel.id, resolution.id),
				eq(DisputeModel.status, DISPUTE_STATUS.UNDER_REVIEW),
			),
		)
		.returning();

	return row;
};

/**
 * Close one of a user's own open disputes as `WITHDRAWN`. Ownership and
 * open-status are both in the `where` clause — another user's dispute, a
 * missing one, or an already-closed one matches nothing and returns
 * `undefined` (the caller's 404 / 409).
 */
export const withdrawDispute = async (
	executor: Executor,
	options: { id: string; userId: string },
): Promise<DisputeMutationRow | undefined> => {
	const [row] = await executor
		.update(DisputeModel)
		.set({ status: DISPUTE_STATUS.WITHDRAWN, resolved_at: new Date() })
		.where(
			and(
				eq(DisputeModel.id, options.id),
				eq(DisputeModel.user_id, options.userId),
				inArray(DisputeModel.status, OPEN_DISPUTE_STATUS),
			),
		)
		.returning(CUSTOMER_COLUMNS);

	return row;
};

/** Insert a new dispute (status defaults to `SUBMITTED`) and return its row. */
export const createDispute = async (
	executor: Executor,
	dispute: NewDispute,
): Promise<DisputeMutationRow> => {
	const [row] = await executor
		.insert(DisputeModel)
		.values({
			user_id: dispute.userId,
			transaction_id: dispute.transactionId,
			reason: dispute.reason,
			description: dispute.description,
		})
		.returning(CUSTOMER_COLUMNS);

	return row!;
};
