import { getTableName, type Logger } from "drizzle-orm";

import {
	AccountModel,
	AdminInviteModel,
	SessionModel,
	VerificationModel,
} from "./schema/index.js";

/**
 * Tables whose bound parameters can hold a credential: session tokens, OTP
 * and email-change verification values, provider tokens, and admin invite
 * tokens.
 */
const SECRET_TABLES = [
	SessionModel,
	VerificationModel,
	AccountModel,
	AdminInviteModel,
].map((table) => `"${getTableName(table)}"`);

/** Whether `query` reads or writes one of `SECRET_TABLES`. */
const touchesSecrets = (query: string): boolean =>
	SECRET_TABLES.some((table) => query.includes(table));

/**
 * One log line in Drizzle's `DefaultLogger` format, `Query: <sql> -- params:
 * [...]`, except that a query on a secret-bearing table prints only how many
 * parameters it had. The SQL itself never contains a value (every value is a
 * `$n` placeholder), so it is always printed in full.
 */
export const formatQuery = (query: string, params: unknown[]): string => {
	const shown = touchesSecrets(query)
		? `[${params.length} redacted]`
		: JSON.stringify(params);
	return `Query: ${query} -- params: ${shown}`;
};

/**
 * The development query logger: Drizzle's usual output, without printing a
 * session token, OTP or invite token from the auth tables.
 */
export const redactingLogger: Logger = {
	logQuery: (query, params) => {
		console.log(formatQuery(query, params));
	},
};
