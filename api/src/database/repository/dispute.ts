import { and, asc, desc, eq, getTableColumns } from "drizzle-orm";

import {
	DISPUTE_STATUS,
	ORDER_DIRECTION,
} from "@transaction-dispute-portal/shared";
import type {
	DisputeReason,
	DisputeResolution,
	DisputeStatus,
	OrderDirection,
} from "@transaction-dispute-portal/shared";

import { DisputeModel } from "../schema/index.js";
import type { DisputeModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";

/**
 * The customer path never selects `user_id` (always the caller) or
 * `resolved_by` (internal) — excluded from the query itself, derived from the
 * table so it follows schema changes.
 */
const { user_id, resolved_by, ...CUSTOMER_COLUMNS } = getTableColumns(DisputeModel);

export type DisputeRow = Omit<DisputeModelSelect, "user_id" | "resolved_by">;

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
			.select(CUSTOMER_COLUMNS)
			.from(DisputeModel)
			.where(where)
			.orderBy(direction(DisputeModel.created_at), desc(DisputeModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.$count(DisputeModel, where),
	]);

	return { rows, total };
};

/** A single dispute, but only if it belongs to `userId` — otherwise `undefined`. */
export const findUserDisputeById = async (
	executor: Executor,
	options: { id: string; userId: string },
): Promise<DisputeRow | undefined> => {
	const [row] = await executor
		.select(CUSTOMER_COLUMNS)
		.from(DisputeModel)
		.where(
			and(
				eq(DisputeModel.id, options.id),
				eq(DisputeModel.user_id, options.userId),
			),
		)
		.limit(1);

	return row;
};

/** One page of all disputes (any owner), for the admin review queue, plus the full match count. */
export const findDisputesForReview = async (
	executor: Executor,
	options: FindManyForReviewOptions,
): Promise<Page<DisputeModelSelect>> => {
	const where = options.status
		? eq(DisputeModel.status, options.status)
		: undefined;

	const direction = options.order === ORDER_DIRECTION.asc ? asc : desc;

	const [rows, total] = await Promise.all([
		executor
			.select()
			.from(DisputeModel)
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
): Promise<DisputeModelSelect | undefined> => {
	const [row] = await executor
		.select()
		.from(DisputeModel)
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

/** Insert a new dispute (status defaults to `SUBMITTED`) and return its row. */
export const createDispute = async (
	executor: Executor,
	dispute: NewDispute,
): Promise<DisputeRow> => {
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
