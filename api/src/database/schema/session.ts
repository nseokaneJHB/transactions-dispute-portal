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

export const SessionModel = pgTable(
	"session",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		user_agent: varchar("user_agent", { length: 255 }),
		ip_address: varchar("ip_address", { length: 255 }),
		token: varchar("token", { length: 255 }).notNull().unique(),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),

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
	},
	(table) => [
		index("session_user_id_idx").on(table.user_id),
		index("session_updated_idx").on(table.updated_at),
		index("session_expires_at_idx").on(table.expires_at),

		uniqueIndex("session_token_uq_idx").on(table.token),
	],
);

export type SessionModelInsert = typeof SessionModel.$inferInsert;
export type SessionModelSelect = typeof SessionModel.$inferSelect;

export type SessionModelUniqueWhere =
	| { id: SessionModelSelect["id"] }
	| { token: SessionModelSelect["token"] };
