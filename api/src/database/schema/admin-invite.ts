import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { UserModel } from "./user.js";

export const AdminInviteModel = pgTable(
	"admin_invite",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		email: varchar("email", { length: 255 }).notNull(),
		token: varchar("token", { length: 255 }).notNull().unique(),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
		accepted_at: timestamp("accepted_at", { withTimezone: true }),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => sql`now()`),

		invited_by: uuid("invited_by")
			.notNull()
			.references(() => UserModel.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("admin_invite_email_idx").on(table.email),
		index("admin_invite_invited_by_idx").on(table.invited_by),
		index("admin_invite_updated_idx").on(table.updated_at),

		uniqueIndex("admin_invite_token_uq_idx").on(table.token),
	],
);

export type AdminInviteModelInsert = typeof AdminInviteModel.$inferInsert;
export type AdminInviteModelSelect = typeof AdminInviteModel.$inferSelect;

export type AdminInviteModelUniqueWhere =
	| { id: AdminInviteModelSelect["id"] }
	| { token: AdminInviteModelSelect["token"] };
