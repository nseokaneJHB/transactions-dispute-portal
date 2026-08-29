import { sql } from "drizzle-orm";

import {
	index,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { AUTH_EVENT } from "@transaction-dispute-portal/shared";

import { UserModel } from "./user.js";

export const authEventEnum = pgEnum("authEvent", AUTH_EVENT);

export const AuthAuditLogModel = pgTable(
	"auth_audit_log",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		email: varchar("email", { length: 255 }).notNull(),
		ip_address: varchar("ip_address", { length: 255 }),
		user_agent: varchar("user_agent", { length: 255 }),

		event: authEventEnum("event").notNull(),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),

		user_id: uuid("user_id").references(() => UserModel.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("auth_audit_log_email_idx").on(table.email),
		index("auth_audit_log_event_idx").on(table.event),
		index("auth_audit_log_user_id_idx").on(table.user_id),
		index("auth_audit_log_created_at_idx").on(table.created_at),
	],
);

export type AuthAuditLogModelInsert = typeof AuthAuditLogModel.$inferInsert;
export type AuthAuditLogModelSelect = typeof AuthAuditLogModel.$inferSelect;

export type AuthAuditLogModelUniqueWhere = {
	id: AuthAuditLogModelSelect["id"];
};
