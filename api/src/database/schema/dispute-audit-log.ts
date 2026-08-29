import { sql } from "drizzle-orm";

import {
	index,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { DisputeModel, disputeStatusEnum } from "./dispute.js";
import { UserModel } from "./user.js";

export const DisputeAuditLogModel = pgTable(
	"dispute_audit_log",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		note: text("note"),

		from_status: disputeStatusEnum("from_status"),
		to_status: disputeStatusEnum("to_status").notNull(),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		actor_id: uuid("actor_id").references(() => UserModel.id, {
			onDelete: "set null",
		}),
		dispute_id: uuid("dispute_id")
			.notNull()
			.references(() => DisputeModel.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("dispute_audit_log_actor_id_idx").on(table.actor_id),
		index("dispute_audit_log_dispute_id_idx").on(table.dispute_id),
		index("dispute_audit_log_created_at_idx").on(table.created_at),
	],
);

export type DisputeAuditLogModelInsert =
	typeof DisputeAuditLogModel.$inferInsert;
export type DisputeAuditLogModelSelect =
	typeof DisputeAuditLogModel.$inferSelect;

export type DisputeAuditLogModelUniqueWhere = {
	id: DisputeAuditLogModelSelect["id"];
};
