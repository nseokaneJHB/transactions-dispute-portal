import { and, eq, ne } from "drizzle-orm";

import { SessionModel } from "../schema/index.js";

import type { Executor } from "../executor.js";

/**
 * Whether this user has any earlier session from the same device (matched on
 * `user_agent`) other than `excludeSessionId`. Used to decide if a login is
 * from a device the account has been seen on before.
 */
export const hasKnownDeviceSession = async (
	executor: Executor,
	options: { userId: string; userAgent: string; excludeSessionId: string },
): Promise<boolean> => {
	const [row] = await executor
		.select({ id: SessionModel.id })
		.from(SessionModel)
		.where(
			and(
				eq(SessionModel.user_id, options.userId),
				eq(SessionModel.user_agent, options.userAgent),
				ne(SessionModel.id, options.excludeSessionId),
			),
		)
		.limit(1);

	return Boolean(row);
};
