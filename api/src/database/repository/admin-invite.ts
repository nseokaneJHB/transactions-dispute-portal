import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { AdminInviteModel } from "../schema/index.js";
import type { AdminInviteModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";

interface NewAdminInvite {
	email: string;
	token: string;
	expiresAt: Date;
	invitedBy: string;
}

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
