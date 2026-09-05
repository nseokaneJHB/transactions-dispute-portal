import { eq } from "drizzle-orm";

import type { Role } from "@transaction-dispute-portal/shared";

import { UserModel } from "../schema/index.js";
import type { UserModelSelect } from "../schema/index.js";

import type { Executor } from "../executor.js";

interface NewUser {
	name: string;
	email: string;
	role: Role;
}

/** A single user by email, or `undefined`. */
export const findUserByEmail = async (
	executor: Executor,
	email: string,
): Promise<UserModelSelect | undefined> => {
	const [row] = await executor
		.select()
		.from(UserModel)
		.where(eq(UserModel.email, email))
		.limit(1);

	return row;
};

/**
 * Insert a user. `email_verified` is `true` — the only caller is invite
 * acceptance, where clicking the emailed link already proves the address.
 */
export const createUser = async (
	executor: Executor,
	user: NewUser,
): Promise<UserModelSelect> => {
	const [row] = await executor
		.insert(UserModel)
		.values({
			name: user.name,
			email: user.email,
			role: user.role,
			email_verified: true,
		})
		.returning();

	return row!;
};
