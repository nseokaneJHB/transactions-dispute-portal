import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { USER_ROLE } from "@transaction-dispute-portal/shared";

export const userRoleEnum = pgEnum("userRole", USER_ROLE);

export const UserModel = pgTable(
	"user",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		image: text("image"),
		name: varchar("name", { length: 255 }).notNull(),
		email: varchar("email", { length: 255 }).notNull().unique(),
		email_verified: boolean("email_verified").default(false).notNull(),

		role: userRoleEnum("role").default(USER_ROLE.CUSTOMER).notNull(),

		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => sql`now()`),
	},
	(table) => [
		index("user_role_idx").on(table.role),
		index("user_updated_idx").on(table.updated_at),

		uniqueIndex("user_email_uq_idx").on(table.email),
	],
);

export type UserModelInsert = typeof UserModel.$inferInsert;
export type UserModelSelect = typeof UserModel.$inferSelect;

export type UserModelUniqueWhere =
	| { id: UserModelSelect["id"] }
	| { email: UserModelSelect["email"] };
