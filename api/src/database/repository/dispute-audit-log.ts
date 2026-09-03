import { DisputeAuditLogModel } from "../schema/index.js";
import type { DisputeAuditLogModelInsert } from "../schema/index.js";

import type { Executor } from "../executor.js";

interface DisputeStatusChange {
	disputeId: string;
	actorId?: string | null;
	fromStatus?: DisputeAuditLogModelInsert["from_status"];
	toStatus: DisputeAuditLogModelInsert["to_status"];
	note?: string | null;
}

/** Append one row to `dispute_audit_log` — one per dispute status change. */
export const recordDisputeStatusChange = async (
	executor: Executor,
	change: DisputeStatusChange,
): Promise<void> => {
	await executor.insert(DisputeAuditLogModel).values({
		dispute_id: change.disputeId,
		actor_id: change.actorId ?? null,
		from_status: change.fromStatus ?? null,
		to_status: change.toStatus,
		note: change.note ?? null,
	});
};
