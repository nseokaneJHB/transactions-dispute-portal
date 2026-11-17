import { and, count, eq, getTableColumns, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import {
	ADMIN_DISPUTE_SORT,
	DISPUTE_SORT,
	DISPUTE_STATUS,
	OPEN_DISPUTE_STATUS,
	ORDER_DIRECTION,
	REVIEW_QUEUE_ORDER,
} from "@transaction-dispute-portal/shared";
import type {
	AdminDisputeSort,
	AdminDisputesQuery,
	DisputeReason,
	DisputeResolution,
	DisputeSort,
	DisputesQuery,
	DisputeStatus,
	DisputeStatusCounts,
} from "@transaction-dispute-portal/shared";

import { DisputeModel, TransactionModel, UserModel } from "../schema/index.js";
import type { DisputeModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";
import {
	containsText,
	keyset,
	sortedBy,
	withinAmount,
	withinDays,
	type CursorPage,
	type SeekOrder,
} from "./list-filters.js";

/**
 * Binds each value the shared `DISPUTE_SORT` whitelist allows to its Drizzle
 * column — `merchant` / `amount_cents` live on the joined transaction, which is
 * why this can't be a plain `getTableColumns` lookup and can't live in
 * `shared`. The `Record` type keeps it in step with the whitelist. `created_at`
 * is the default.
 */
const SORT_COLUMN: Record<DisputeSort, PgColumn> = {
	[DISPUTE_SORT.created_at]: DisputeModel.created_at,
	[DISPUTE_SORT.merchant]: TransactionModel.merchant_name,
	[DISPUTE_SORT.amount_cents]: TransactionModel.amount_cents,
	[DISPUTE_SORT.status]: DisputeModel.status,
};

/** The review queue also joins the customer, so it can additionally sort by their name. */
const REVIEW_SORT_COLUMN: Record<AdminDisputeSort, PgColumn> = {
	...SORT_COLUMN,
	[ADMIN_DISPUTE_SORT.customer]: UserModel.name,
};

/**
 * The review queue's order when no `sort` is asked for — a work list:
 * unresolved first (`status` enum order puts `SUBMITTED` / `UNDER_REVIEW` ahead
 * of the terminal states), oldest of those at the top so nothing rots, newest
 * id first among ties. `id` runs against the other two keys, which `keyset`
 * handles; `dispute_status_created_idx` matches it exactly.
 */
const reviewQueueOrder = (order: SeekOrder["order"]): SeekOrder => ({
	sort: REVIEW_QUEUE_ORDER,
	order,
	keys: [
		{ expression: DisputeModel.status, direction: ORDER_DIRECTION.asc },
		{ expression: DisputeModel.created_at, direction: ORDER_DIRECTION.asc },
		{ expression: DisputeModel.id, direction: ORDER_DIRECTION.desc },
	],
});

/**
 * The customer path never selects `user_id` (always the caller) or
 * `resolved_by` (internal) — excluded from the query itself, derived from the
 * table so it follows schema changes.
 */
const { user_id, resolved_by, ...CUSTOMER_COLUMNS } =
	getTableColumns(DisputeModel);

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
 * The dispute owner's own columns, joined onto every admin dispute read so a
 * reviewer can see whose money they are deciding on without a second lookup by
 * `user_id`. `user_id` is `NOT NULL`, so this inner join never drops a row.
 */
const CUSTOMER_SUMMARY_COLUMNS = {
	name: UserModel.name,
	email: UserModel.email,
};

type CustomerSummary = {
	name: string;
	email: string;
};

/**
 * A dispute row as it comes back from an `UPDATE`/`INSERT ... RETURNING` —
 * no joined transaction, since those statements can't join. The service layer
 * already has the transaction in hand from a prior read in every such case,
 * so it's merged in there instead of re-queried.
 */
type DisputeMutationRow = Omit<DisputeModelSelect, "user_id" | "resolved_by">;

export type DisputeRow = DisputeMutationRow & {
	transaction: TransactionSummary;
};

export type AdminDisputeRow = DisputeModelSelect & {
	transaction: TransactionSummary;
	customer: CustomerSummary;
};

/**
 * The validated `disputesQuerySchema` list query. The customer path
 * (`FindManyOptions`) adds a `userId` scope; the admin review queue
 * (`FindManyForReviewOptions`) is unscoped and ignores `transaction_id`.
 */
type FindManyOptions = DisputesQuery & { userId: string };

type FindManyForReviewOptions = AdminDisputesQuery;

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

/**
 * One page of a user's disputes. `search` matches the dispute description and
 * the disputed merchant's name; `from` / `to` bound `created_at`;
 * `min_amount_cents` / `max_amount_cents` bound the disputed transaction's
 * amount; `sort` / `order` pick the column and direction (`created_at`
 * descending by default), with `id` breaking ties. The page is found by
 * `cursor` (`keyset`), never by skipping rows.
 */
export const findDisputesByUser = async (
	executor: Executor,
	options: FindManyOptions,
): Promise<CursorPage<DisputeRow>> => {
	const where = and(
		eq(DisputeModel.user_id, options.userId),
		options.status ? eq(DisputeModel.status, options.status) : undefined,
		options.transaction_id
			? eq(DisputeModel.transaction_id, options.transaction_id)
			: undefined,
		options.search
			? containsText(
					options.search,
					DisputeModel.description,
					TransactionModel.merchant_name,
				)
			: undefined,
		withinDays(DisputeModel.created_at, options.from, options.to),
		withinAmount(
			TransactionModel.amount_cents,
			options.min_amount_cents,
			options.max_amount_cents,
		),
	);

	const sort = options.sort ?? DISPUTE_SORT.created_at;
	const page = keyset(
		sortedBy(
			sort,
			options.order ?? ORDER_DIRECTION.desc,
			SORT_COLUMN[sort],
			DisputeModel.id,
		),
		options.cursor,
		options.limit,
	);

	const probed = await executor
		.select({
			...CUSTOMER_COLUMNS,
			transaction: TRANSACTION_SUMMARY_COLUMNS,
			seek: page.seek,
		})
		.from(DisputeModel)
		.innerJoin(
			TransactionModel,
			eq(DisputeModel.transaction_id, TransactionModel.id),
		)
		.where(and(where, page.where))
		.orderBy(...page.orderBy)
		.limit(page.limit);

	return page.toPage(probed);
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

	const [row] = await (queryOptions.lockForUpdate
		? query.for("update")
		: query);

	return row;
};

/**
 * One page of all disputes (any owner), for the admin review queue. `search`
 * also matches the owning customer's name and email, since a reviewer often
 * looks a person up; everything else matches `findDisputesByUser`. With no
 * explicit `sort` the queue is in `reviewQueueOrder`; an explicit `sort`
 * overrides that order entirely. Either way the page is found by `cursor`.
 */
export const findDisputesForReview = async (
	executor: Executor,
	options: FindManyForReviewOptions,
): Promise<CursorPage<AdminDisputeRow>> => {
	const where = and(
		options.status ? eq(DisputeModel.status, options.status) : undefined,
		options.search
			? containsText(
					options.search,
					DisputeModel.description,
					TransactionModel.merchant_name,
					UserModel.name,
					UserModel.email,
				)
			: undefined,
		withinDays(DisputeModel.created_at, options.from, options.to),
		withinAmount(
			TransactionModel.amount_cents,
			options.min_amount_cents,
			options.max_amount_cents,
		),
	);

	const order = options.order ?? ORDER_DIRECTION.desc;
	const page = keyset(
		options.sort
			? sortedBy(
					options.sort,
					order,
					REVIEW_SORT_COLUMN[options.sort],
					DisputeModel.id,
				)
			: reviewQueueOrder(order),
		options.cursor,
		options.limit,
	);

	const probed = await executor
		.select({
			...getTableColumns(DisputeModel),
			transaction: TRANSACTION_SUMMARY_COLUMNS,
			customer: CUSTOMER_SUMMARY_COLUMNS,
			seek: page.seek,
		})
		.from(DisputeModel)
		.innerJoin(
			TransactionModel,
			eq(DisputeModel.transaction_id, TransactionModel.id),
		)
		.innerJoin(UserModel, eq(DisputeModel.user_id, UserModel.id))
		.where(and(where, page.where))
		.orderBy(...page.orderBy)
		.limit(page.limit);

	return page.toPage(probed);
};

/**
 * How many disputes sit in each lifecycle status right now — unfiltered, for
 * the review-queue stat cards. Zero-fills statuses with no rows so the caller
 * always gets a full `Record`.
 */
export const countDisputesByStatus = async (
	executor: Executor,
): Promise<DisputeStatusCounts> => {
	const rows = await executor
		.select({ status: DisputeModel.status, total: count() })
		.from(DisputeModel)
		.groupBy(DisputeModel.status);

	const counts = Object.fromEntries(
		Object.values(DISPUTE_STATUS).map((status) => [status, 0]),
	) as Record<DisputeStatus, number>;

	for (const row of rows) counts[row.status] = row.total;

	return counts;
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
			customer: CUSTOMER_SUMMARY_COLUMNS,
		})
		.from(DisputeModel)
		.innerJoin(
			TransactionModel,
			eq(DisputeModel.transaction_id, TransactionModel.id),
		)
		.innerJoin(UserModel, eq(DisputeModel.user_id, UserModel.id))
		.where(eq(DisputeModel.id, options.id))
		.limit(1);

	return row;
};

/**
 * Move a `SUBMITTED` dispute to `UNDER_REVIEW`. The current-status check is in
 * the `where` clause, not a prior read (`docs/progress-and-decisions.md` #4) — a concurrent
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
