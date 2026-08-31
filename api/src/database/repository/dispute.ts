import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import {
	ORDER_DIRECTION,
	OPEN_DISPUTE_STATUS,
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

const COLUMNS = {
	id: DisputeModel.id,
	transaction_id: DisputeModel.transaction_id,
	status: DisputeModel.status,
	reason: DisputeModel.reason,
	description: DisputeModel.description,
	resolution_note: DisputeModel.resolution_note,
	resolved_at: DisputeModel.resolved_at,
	created_at: DisputeModel.created_at,
	updated_at: DisputeModel.updated_at,
} as const;

export type DisputeRow = Pick<DisputeModelSelect, keyof typeof COLUMNS>;

/** The customer columns plus the two a reviewer needs: whose dispute, and who closed it. */
const REVIEW_COLUMNS = {
	...COLUMNS,
	user_id: DisputeModel.user_id,
	resolved_by: DisputeModel.resolved_by,
} as const;

export type DisputeReviewRow = Pick<
	DisputeModelSelect,
	keyof typeof REVIEW_COLUMNS
>;

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

	const [rows, [tally]] = await Promise.all([
		executor
			.select(COLUMNS)
			.from(DisputeModel)
			.where(where)
			.orderBy(direction(DisputeModel.created_at), desc(DisputeModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.select({ value: count() }).from(DisputeModel).where(where),
	]);

	return { rows, total: tally?.value ?? 0 };
};

/** A single dispute, but only if it belongs to `userId` — otherwise `undefined`. */
export const findUserDisputeById = async (
	executor: Executor,
	options: { id: string; userId: string },
): Promise<DisputeRow | undefined> => {
	const [row] = await executor
		.select(COLUMNS)
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
): Promise<Page<DisputeReviewRow>> => {
	const where = options.status
		? eq(DisputeModel.status, options.status)
		: undefined;

	const direction = options.order === ORDER_DIRECTION.asc ? asc : desc;

	const [rows, [tally]] = await Promise.all([
		executor
			.select(REVIEW_COLUMNS)
			.from(DisputeModel)
			.where(where)
			.orderBy(direction(DisputeModel.created_at), desc(DisputeModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.select({ value: count() }).from(DisputeModel).where(where),
	]);

	return { rows, total: tally?.value ?? 0 };
};

/** A single dispute by id, unscoped — for the admin review path. `undefined` if it does not exist. */
export const findDisputeById = async (
	executor: Executor,
	options: { id: string },
): Promise<DisputeReviewRow | undefined> => {
	const [row] = await executor
		.select(REVIEW_COLUMNS)
		.from(DisputeModel)
		.where(eq(DisputeModel.id, options.id))
		.limit(1);

	return row;
};

/**
 * Move a dispute to a terminal status, recording the note, the reviewer, and
 * the close time. The open-status check is in the `where` clause, not a prior
 * read (`docs/decisions.md` #4) — a concurrent resolve on the same dispute
 * matches nothing and gets `undefined`, the caller's 409.
 */
export const resolveDispute = async (
	executor: Executor,
	resolution: ResolveDisputeInput,
): Promise<DisputeReviewRow | undefined> => {
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
				inArray(DisputeModel.status, [...OPEN_DISPUTE_STATUS]),
			),
		)
		.returning(REVIEW_COLUMNS);

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
		.returning(COLUMNS);

	return row!;
};
