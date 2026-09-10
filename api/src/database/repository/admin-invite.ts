import {
	and,
	desc,
	eq,
	gt,
	isNotNull,
	isNull,
	lte,
	sql,
	type Column,
	type SQL,
} from "drizzle-orm";

import {
	ADMIN_INVITE_SORT,
	ADMIN_INVITE_STATUS,
} from "@transaction-dispute-portal/shared";
import type {
	AdminInvitesQuery,
	AdminInviteSort,
	AdminInviteStatus,
} from "@transaction-dispute-portal/shared";

import { AdminInviteModel } from "../schema/index.js";
import type { AdminInviteModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";
import {
	containsText,
	sortDirection,
	withinDays,
	type Page,
} from "./list-filters.js";

/**
 * Binds each value the shared `ADMIN_INVITE_SORT` whitelist allows to what it
 * orders by — the piece that references the table and so can't live in
 * `shared`. `status` is derived, not a column, so it orders by a CASE that
 * puts pending before accepted before expired (mirrors `statusPredicate`).
 * The `Record` type keeps this in step with the whitelist. `created_at` is
 * the default.
 */
const SORT_COLUMN: Record<AdminInviteSort, Column | SQL> = {
	[ADMIN_INVITE_SORT.email]: AdminInviteModel.email,
	[ADMIN_INVITE_SORT.created_at]: AdminInviteModel.created_at,
	[ADMIN_INVITE_SORT.expires_at]: AdminInviteModel.expires_at,
	[ADMIN_INVITE_SORT.status]: sql`case
		when ${AdminInviteModel.accepted_at} is not null then 1
		when ${AdminInviteModel.expires_at} <= now() then 2
		else 0
	end`,
};

interface NewAdminInvite {
	email: string;
	token: string;
	expiresAt: Date;
	invitedBy: string;
}

/** The validated `adminInvitesQuerySchema` list query, scoped to the calling admin. */
type FindInvitesOptions = AdminInvitesQuery & { invitedBy: string };

/**
 * `status` is derived, not a column — translate it to a predicate over
 * `accepted_at` / `expires_at` so filtering and the page count stay honest.
 */
const statusPredicate = (status: AdminInviteStatus): SQL | undefined => {
	switch (status) {
		case ADMIN_INVITE_STATUS.ACCEPTED:
			return isNotNull(AdminInviteModel.accepted_at);
		case ADMIN_INVITE_STATUS.EXPIRED:
			return and(
				isNull(AdminInviteModel.accepted_at),
				lte(AdminInviteModel.expires_at, sql`now()`),
			);
		case ADMIN_INVITE_STATUS.PENDING:
			return and(
				isNull(AdminInviteModel.accepted_at),
				gt(AdminInviteModel.expires_at, sql`now()`),
			);
	}
};

/** Insert an invite and return its row. */
export const createAdminInvite = async (
	executor: Executor,
	invite: NewAdminInvite,
): Promise<AdminInviteModelSelect> => {
	const [row] = await executor
		.insert(AdminInviteModel)
		.values({
			email: invite.email,
			token: invite.token,
			expires_at: invite.expiresAt,
			invited_by: invite.invitedBy,
		})
		.returning();

	return row!;
};

/**
 * One page of a given admin's invites, plus the full match count. `search`
 * matches the invitee email; `from` / `to` bound `created_at`; `sort` / `order`
 * pick the column and direction (`created_at` descending by default).
 */
export const findAdminInvitesByInviter = async (
	executor: Executor,
	options: FindInvitesOptions,
): Promise<Page<AdminInviteModelSelect>> => {
	const where = and(
		eq(AdminInviteModel.invited_by, options.invitedBy),
		options.status ? statusPredicate(options.status) : undefined,
		options.search
			? containsText(options.search, AdminInviteModel.email)
			: undefined,
		withinDays(AdminInviteModel.created_at, options.from, options.to),
	);

	const direction = sortDirection(options.order);
	const sortColumn = SORT_COLUMN[options.sort ?? ADMIN_INVITE_SORT.created_at];

	const [rows, total] = await Promise.all([
		executor
			.select()
			.from(AdminInviteModel)
			.where(where)
			.orderBy(direction(sortColumn), desc(AdminInviteModel.id))
			.limit(options.limit)
			.offset((options.page - 1) * options.limit),
		executor.$count(AdminInviteModel, where),
	]);

	return { rows, total };
};

/** A single invite by token, unscoped — `undefined` if it does not exist. */
export const findAdminInviteByToken = async (
	executor: Executor,
	token: string,
): Promise<AdminInviteModelSelect | undefined> => {
	const [row] = await executor
		.select()
		.from(AdminInviteModel)
		.where(eq(AdminInviteModel.token, token))
		.limit(1);

	return row;
};

/**
 * Mark an unexpired, unaccepted invite as accepted. The "still valid" check is
 * in the `where` clause, not a prior read (`docs/decisions.md` #4 / #41) — a
 * concurrent accept matches nothing and gets `undefined`, the caller's 409.
 */
export const acceptAdminInvite = async (
	executor: Executor,
	token: string,
): Promise<AdminInviteModelSelect | undefined> => {
	const [row] = await executor
		.update(AdminInviteModel)
		.set({ accepted_at: sql`now()` })
		.where(
			and(
				eq(AdminInviteModel.token, token),
				isNull(AdminInviteModel.accepted_at),
				gt(AdminInviteModel.expires_at, sql`now()`),
			),
		)
		.returning();

	return row;
};
