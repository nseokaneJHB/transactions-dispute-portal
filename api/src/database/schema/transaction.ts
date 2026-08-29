import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { UserModel } from "./user.js";

export const TransactionModel = pgTable(
	"transaction",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		amount_cents: bigint("amount_cents", { mode: "number" }).notNull(),
		merchant_name: varchar("merchant_name", { length: 255 }).notNull(),
		transacted_at: timestamp("transacted_at", {
			withTimezone: true,
		}).notNull(),

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
		index("transaction_user_id_idx").on(table.user_id),
		index("transaction_updated_idx").on(table.updated_at),
		index("transaction_transacted_at_idx").on(table.transacted_at),
		index("transaction_user_transacted_idx").on(
			table.user_id,
			table.transacted_at,
		),
	],
);

export type TransactionModelInsert = typeof TransactionModel.$inferInsert;
export type TransactionModelSelect = typeof TransactionModel.$inferSelect;

export type TransactionModelUniqueWhere = {
	id: TransactionModelSelect["id"];
};
