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

export const AccountModel = pgTable(
	"account",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		scope: varchar("scope", { length: 255 }),
		password: varchar("password", { length: 255 }),
		id_token: varchar("id_token", { length: 255 }),
		issuer: varchar("issuer", { length: 255 }).notNull(),
		access_token: varchar("access_token", { length: 255 }),
		refresh_token: varchar("refresh_token", { length: 255 }),
		account_id: varchar("account_id", { length: 255 }).notNull(),
		provider_id: varchar("provider_id", { length: 255 }).notNull(),
		access_token_expires_at: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refresh_token_expires_at: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),

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
		index("account_user_id_idx").on(table.user_id),
		index("account_updated_idx").on(table.updated_at),

		uniqueIndex("account_issuer_account_id_uq_idx").on(
			table.issuer,
			table.account_id,
		),
	],
);

export type AccountModelInsert = typeof AccountModel.$inferInsert;
export type AccountModelSelect = typeof AccountModel.$inferSelect;

export type AccountModelUniqueWhere = { id: AccountModelSelect["id"] };
