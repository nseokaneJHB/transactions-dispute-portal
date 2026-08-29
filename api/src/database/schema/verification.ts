import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const VerificationModel = pgTable(
	"verification",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		value: text("value").notNull(),
		identifier: varchar("identifier", { length: 255 }).notNull(),
		expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => sql`now()`),
	},
	(table) => [
		index("verification_updated_idx").on(table.updated_at),
		index("verification_identifier_idx").on(table.identifier),
	],
);

export type VerificationModelInsert = typeof VerificationModel.$inferInsert;
export type VerificationModelSelect = typeof VerificationModel.$inferSelect;

export type VerificationModelUniqueWhere = {
	id: VerificationModelSelect["id"];
};
