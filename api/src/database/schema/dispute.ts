import { sql } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { DISPUTE_REASON, DISPUTE_STATUS } from "@transaction-dispute-portal/shared";

import { TransactionModel } from "./transaction.js";
import { UserModel } from "./user.js";

export const disputeStatusEnum = pgEnum("disputeStatus", DISPUTE_STATUS);
export const disputeReasonEnum = pgEnum("disputeReason", DISPUTE_REASON);

export const DisputeModel = pgTable(
	"dispute",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		description: text("description").notNull(),
		resolution_note: text("resolution_note"),
		resolved_at: timestamp("resolved_at", { withTimezone: true }),

		status: disputeStatusEnum("status")
			.default(DISPUTE_STATUS.SUBMITTED)
			.notNull(),
		reason: disputeReasonEnum("reason").notNull(),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => sql`now()`),

		user_id: uuid("user_id")
			.notNull()
			.references(() => UserModel.id, { onDelete: "cascade" }),
		resolved_by: uuid("resolved_by").references(() => UserModel.id, {
			onDelete: "set null",
		}),
		transaction_id: uuid("transaction_id")
			.notNull()
			.references(() => TransactionModel.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("dispute_user_id_idx").on(table.user_id),
		index("dispute_status_idx").on(table.status),
		index("dispute_reason_idx").on(table.reason),
		index("dispute_resolved_by_idx").on(table.resolved_by),
		index("dispute_transaction_id_idx").on(table.transaction_id),
		index("dispute_created_at_idx").on(table.created_at),
		index("dispute_updated_idx").on(table.updated_at),

		uniqueIndex("dispute_open_per_transaction_uq_idx")
			.on(table.transaction_id)
			.where(sql`${table.status} in ('SUBMITTED', 'UNDER_REVIEW')`),
	],
);

export type DisputeModelInsert = typeof DisputeModel.$inferInsert;
export type DisputeModelSelect = typeof DisputeModel.$inferSelect;

export type DisputeModelUniqueWhere = { id: DisputeModelSelect["id"] };
