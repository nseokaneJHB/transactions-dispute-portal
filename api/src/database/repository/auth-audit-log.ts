import { AuthAuditLogModel } from "../schema/index.js";
import type { AuthAuditLogModelInsert } from "../schema/index.js";

import type { Executor } from "../executor.js";

type AuthEvent = AuthAuditLogModelInsert["event"];

interface AuthEventRecord {
	email: string;
	event: AuthEvent;
	userId?: string | null;
	ipAddress?: string | null;
	userAgent?: string | null;
}

const VARCHAR_LIMIT = 255;

const clamp = (value?: string | null): string | null =>
	value ? value.slice(0, VARCHAR_LIMIT) : null;

/**
 * Append one row to `auth_audit_log`. Keyed by `email` (a failed attempt may
 * not resolve to a user), with `user_id` filled in only on a successful login.
 */
export const recordAuthEvent = async (
	executor: Executor,
	record: AuthEventRecord,
): Promise<void> => {
	await executor.insert(AuthAuditLogModel).values({
		email: record.email,
		event: record.event,
		user_id: record.userId ?? null,
		ip_address: clamp(record.ipAddress),
		user_agent: clamp(record.userAgent),
	});
};
