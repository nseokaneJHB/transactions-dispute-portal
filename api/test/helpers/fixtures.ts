import { sql } from "drizzle-orm";

import { USER_ROLE, DISPUTE_REASON } from "@transaction-dispute-portal/shared";

import { connection } from "../../src/database/config.js";
import {
	UserModel,
	DisputeModel,
	TransactionModel,
} from "../../src/database/schema/index.js";

export interface SeededData {
	alice: { id: string; email: string };
	bob: { id: string; email: string };
	admin: { id: string; email: string };
	/** Alice's transactions, none disputed. Index 0 is spoken for by `aliceOpenDispute`. */
	aliceTransactionIds: string[];
	bobTransactionIds: string[];
	/** An open (SUBMITTED) dispute owned by Alice, on `aliceTransactionIds[0]`. */
	aliceOpenDisputeId: string;
}

const ALICE = "alice@test.local";
const BOB = "bob@test.local";
const ADMIN = "admin@test.local";

/** Wipe every table and insert the minimal deterministic set the suites share. */
export const resetDatabase = async (): Promise<SeededData> => {
	await connection.execute(sql`
		truncate table
			"dispute_audit_log", "dispute", "transaction",
			"auth_audit_log", "admin_invite",
			"account", "session", "verification", "user"
		restart identity cascade
	`);

	const [alice, bob, admin] = await connection
		.insert(UserModel)
		.values([
			{ name: "Alice Test", email: ALICE, email_verified: true },
			{ name: "Bob Test", email: BOB, email_verified: true },
			{
				name: "Admin Test",
				email: ADMIN,
				email_verified: true,
				role: USER_ROLE.ADMIN,
			},
		])
		.returning();

	const transactions = await connection
		.insert(TransactionModel)
		.values([
			...Array.from({ length: 4 }, (_, index) => ({
				user_id: alice!.id,
				amount_cents: 10_000 + index * 1000,
				merchant_name: `Merchant A${index}`,
				transacted_at: new Date("2026-01-0" + (index + 1)),
			})),
			...Array.from({ length: 2 }, (_, index) => ({
				user_id: bob!.id,
				amount_cents: 20_000 + index * 1000,
				merchant_name: `Merchant B${index}`,
				transacted_at: new Date("2026-02-0" + (index + 1)),
			})),
		])
		.returning();

	const aliceTransactionIds = transactions
		.filter((row) => row.user_id === alice!.id)
		.map((row) => row.id);
	const bobTransactionIds = transactions
		.filter((row) => row.user_id === bob!.id)
		.map((row) => row.id);

	const [dispute] = await connection
		.insert(DisputeModel)
		.values({
			user_id: alice!.id,
			transaction_id: aliceTransactionIds[0]!,
			reason: DISPUTE_REASON.FRAUDULENT_CHARGE,
			description: "I did not make this charge.",
		})
		.returning();

	return {
		alice: { id: alice!.id, email: ALICE },
		bob: { id: bob!.id, email: BOB },
		admin: { id: admin!.id, email: ADMIN },
		aliceTransactionIds,
		bobTransactionIds,
		aliceOpenDisputeId: dispute!.id,
	};
};
