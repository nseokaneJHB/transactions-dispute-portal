import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { faker } from "@faker-js/faker";

import {
	USER_ROLE,
	DISPUTE_REASON,
	DISPUTE_STATUS,
} from "@transaction-dispute-portal/shared";

import {
	UserModel,
	DisputeModel,
	TransactionModel,
	DisputeAuditLogModel,
} from "./schema/index.js";
import type {
	UserModelInsert,
	DisputeModelSelect,
	DisputeModelInsert,
	TransactionModelSelect,
	TransactionModelInsert,
	DisputeAuditLogModelInsert,
} from "./schema/index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

type DisputeStatus = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS];
type DisputeReason = (typeof DISPUTE_REASON)[keyof typeof DISPUTE_REASON];

const FAKER_SEED = 20260830;

const ADMIN = { name: "Nolan Seokane", email: "thelowlydev@gmail.com" };
const DEMO_CUSTOMER_EMAIL = "customer@example.com";
const NEWCOMER_EMAIL = "newcomer@example.com";

const CUSTOMER_COUNT = 30;
const DEMO_TRANSACTIONS = 400;
const NEWCOMER_TRANSACTIONS = 6;
const DEMO_DISPUTES_PER_STATUS = 8;
const INSERT_CHUNK = 500;

const MERCHANTS = [
	"Woolworths",
	"Checkers",
	"Pick n Pay",
	"Shoprite",
	"SPAR",
	"Takealot",
	"Mr Price",
	"Clicks",
	"Dis-Chem",
	"Game",
	"Makro",
	"Uber",
	"Uber Eats",
	"Mr D Food",
	"Bolt",
	"Netflix",
	"Spotify",
	"Showmax",
	"DStv",
	"Vodacom",
	"MTN",
	"Cell C",
	"Telkom",
	"Eskom",
	"City of Cape Town",
	"Shell",
	"Engen",
	"BP",
	"Sasol",
	"Nando's",
	"KFC",
	"Steers",
	"Ocean Basket",
	"Vida e Caffè",
	"Exclusive Books",
	"Cape Union Mart",
	"Sportsmans Warehouse",
	"Builders Warehouse",
	"iStore",
	"Superbalist",
];

const RESOLUTION_NOTES: Record<DisputeStatus, string[]> = {
	[DISPUTE_STATUS.SUBMITTED]: [],
	[DISPUTE_STATUS.UNDER_REVIEW]: [],
	[DISPUTE_STATUS.RESOLVED]: [
		"Merchant confirmed the error and the amount has been refunded in full.",
		"Chargeback approved — funds returned to the customer's account.",
		"Duplicate settlement reversed by the acquiring bank.",
		"Investigation upheld the customer; a credit was applied.",
	],
	[DISPUTE_STATUS.REJECTED]: [
		"Transaction matched the customer's device, location and past activity — no fraud found.",
		"Merchant supplied a signed delivery confirmation; claim not upheld.",
		"Customer confirmed the charge was legitimate on follow-up.",
		"Dispute fell outside the 90-day window allowed by the scheme.",
	],
};

const pick = <T>(values: readonly T[]): T => faker.helpers.arrayElement(values);

/**
 * A plausible ZAR amount in cents — mostly everyday spend, occasionally a large
 * purchase so the data has a realistic spread.
 */
const randomAmountCents = (): number =>
	faker.datatype.boolean(0.1)
		? faker.number.int({ min: 300_000, max: 2_500_000 })
		: faker.number.int({ min: 2_000, max: 300_000 });

const randomDisputeStatus = (): DisputeStatus =>
	faker.helpers.weightedArrayElement([
		{ weight: 25, value: DISPUTE_STATUS.SUBMITTED },
		{ weight: 20, value: DISPUTE_STATUS.UNDER_REVIEW },
		{ weight: 35, value: DISPUTE_STATUS.RESOLVED },
		{ weight: 20, value: DISPUTE_STATUS.REJECTED },
	]);

/**
 * A first-person dispute description keyed to its reason, so the seeded rows
 * read like something a customer actually wrote.
 */
const describeDispute = (reason: DisputeReason, merchant: string): string => {
	switch (reason) {
		case DISPUTE_REASON.FRAUDULENT_CHARGE:
			return `I did not authorise this payment to ${merchant} and do not recognise it. My card has been with me the whole time.`;
		case DISPUTE_REASON.DUPLICATE_CHARGE:
			return `${merchant} charged me twice for the same purchase within a few minutes. I only made one payment.`;
		case DISPUTE_REASON.INCORRECT_AMOUNT:
			return `The amount ${merchant} took is higher than what I agreed to at the till. The slip shows a different figure.`;
		case DISPUTE_REASON.GOODS_NOT_RECEIVED:
			return `I paid ${merchant} for an order that never arrived. It has been well past the delivery date with no update.`;
		case DISPUTE_REASON.SUBSCRIPTION_NOT_CANCELLED:
			return `I cancelled my ${merchant} subscription but they billed me again this month.`;
		default:
			return `Something is wrong with this ${merchant} charge and I would like it reviewed. ${faker.lorem.sentence()}`;
	}
};

const chunk = <T>(items: readonly T[], size: number): T[][] => {
	const batches: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		batches.push(items.slice(index, index + size));
	}
	return batches;
};

const seed = async (): Promise<void> => {
	faker.seed(FAKER_SEED);

	const client = postgres(connectionString, { max: 1, prepare: false });
	const database = drizzle(client, { casing: "snake_case" });

	const now = new Date();
	const earliestTransaction = new Date(now);
	earliestTransaction.setMonth(earliestTransaction.getMonth() - 14);

	try {
		await database.execute(sql`
			truncate table
				"dispute_audit_log", "dispute", "transaction",
				"auth_audit_log", "admin_invite",
				"account", "session", "verification", "user"
			restart identity cascade
		`);

		const userRows: UserModelInsert[] = [
			{
				name: ADMIN.name,
				email: ADMIN.email,
				email_verified: true,
				role: USER_ROLE.ADMIN,
			},
			{
				name: "Demo Customer",
				email: DEMO_CUSTOMER_EMAIL,
				email_verified: true,
				role: USER_ROLE.CUSTOMER,
			},
			{
				name: "New Customer",
				email: NEWCOMER_EMAIL,
				email_verified: true,
				role: USER_ROLE.CUSTOMER,
			},
		];

		for (let index = 1; index <= CUSTOMER_COUNT - 2; index += 1) {
			const firstName = faker.person.firstName();
			const lastName = faker.person.lastName();
			userRows.push({
				name: `${firstName} ${lastName}`,
				email: `${firstName}.${lastName}.${index}@example.com`
					.toLowerCase()
					.replace(/\s+/g, ""),
				email_verified: true,
				role: USER_ROLE.CUSTOMER,
			});
		}

		const users = await database.insert(UserModel).values(userRows).returning();

		const admin = users.find(({ email }) => email === ADMIN.email)!;
		const demo = users.find(({ email }) => email === DEMO_CUSTOMER_EMAIL)!;
		const newcomer = users.find(({ email }) => email === NEWCOMER_EMAIL)!;
		const regulars = users.filter(
			({ id, role }) =>
				role === USER_ROLE.CUSTOMER && id !== demo.id && id !== newcomer.id,
		);

		const transactionRows: TransactionModelInsert[] = [];
		const addTransactions = (userId: string, count: number): void => {
			for (let index = 0; index < count; index += 1) {
				transactionRows.push({
					user_id: userId,
					amount_cents: randomAmountCents(),
					merchant_name: pick(MERCHANTS),
					transacted_at: faker.date.between({
						from: earliestTransaction,
						to: now,
					}),
				});
			}
		};

		addTransactions(demo.id, DEMO_TRANSACTIONS);
		addTransactions(newcomer.id, NEWCOMER_TRANSACTIONS);
		for (const regular of regulars) {
			addTransactions(regular.id, faker.number.int({ min: 60, max: 220 }));
		}

		const transactions: TransactionModelSelect[] = [];
		for (const batch of chunk(transactionRows, INSERT_CHUNK)) {
			transactions.push(
				...(await database
					.insert(TransactionModel)
					.values(batch)
					.returning()),
			);
		}

		const byUser = new Map<string, TransactionModelSelect[]>();
		for (const transaction of transactions) {
			const owned = byUser.get(transaction.user_id) ?? [];
			owned.push(transaction);
			byUser.set(transaction.user_id, owned);
		}

		const disputeRows: DisputeModelInsert[] = [];
		const addDispute = (
			transaction: TransactionModelSelect,
			status: DisputeStatus,
			reason: DisputeReason,
		): void => {
			const createdAt = faker.date.between({
				from: transaction.transacted_at,
				to: now,
			});
			const isClosed =
				status === DISPUTE_STATUS.RESOLVED ||
				status === DISPUTE_STATUS.REJECTED;
			const resolvedAt = isClosed
				? faker.date.between({ from: createdAt, to: now })
				: null;
			const updatedAt =
				resolvedAt ??
				(status === DISPUTE_STATUS.SUBMITTED
					? createdAt
					: faker.date.between({ from: createdAt, to: now }));

			disputeRows.push({
				status,
				reason,
				user_id: transaction.user_id,
				transaction_id: transaction.id,
				description: describeDispute(reason, transaction.merchant_name),
				resolution_note: isClosed
					? pick(RESOLUTION_NOTES[status])
					: null,
				resolved_at: resolvedAt,
				resolved_by: isClosed ? admin.id : null,
				created_at: createdAt,
				updated_at: updatedAt,
			});
		};

		const reasons = Object.values(DISPUTE_REASON);
		const statuses = Object.values(DISPUTE_STATUS);

		const demoTransactions = faker.helpers.shuffle(byUser.get(demo.id) ?? []);
		let demoCursor = 0;
		for (const status of statuses) {
			for (let index = 0; index < DEMO_DISPUTES_PER_STATUS; index += 1) {
				addDispute(
					demoTransactions[demoCursor],
					status,
					reasons[demoCursor % reasons.length],
				);
				demoCursor += 1;
			}
		}

		for (const regular of regulars) {
			const owned = faker.helpers.shuffle(byUser.get(regular.id) ?? []);
			const count = Math.min(
				faker.number.int({ min: 0, max: 14 }),
				owned.length,
			);
			for (let index = 0; index < count; index += 1) {
				addDispute(owned[index], randomDisputeStatus(), pick(reasons));
			}
		}

		const disputes: DisputeModelSelect[] = [];
		for (const batch of chunk(disputeRows, INSERT_CHUNK)) {
			disputes.push(
				...(await database.insert(DisputeModel).values(batch).returning()),
			);
		}

		const auditRows: DisputeAuditLogModelInsert[] = [];
		for (const dispute of disputes) {
			auditRows.push({
				dispute_id: dispute.id,
				actor_id: dispute.user_id,
				from_status: null,
				to_status: DISPUTE_STATUS.SUBMITTED,
				note: "Dispute submitted by the customer.",
				created_at: dispute.created_at,
			});

			if (dispute.status === DISPUTE_STATUS.SUBMITTED) continue;

			auditRows.push({
				dispute_id: dispute.id,
				actor_id: admin.id,
				from_status: DISPUTE_STATUS.SUBMITTED,
				to_status: DISPUTE_STATUS.UNDER_REVIEW,
				note: "Picked up for review by an agent.",
				created_at: faker.date.between({
					from: dispute.created_at,
					to: dispute.resolved_at ?? now,
				}),
			});

			if (dispute.status === DISPUTE_STATUS.UNDER_REVIEW) continue;

			auditRows.push({
				dispute_id: dispute.id,
				actor_id: admin.id,
				from_status: DISPUTE_STATUS.UNDER_REVIEW,
				to_status: dispute.status,
				note: dispute.resolution_note,
				created_at: dispute.resolved_at ?? now,
			});
		}

		for (const batch of chunk(auditRows, INSERT_CHUNK)) {
			await database.insert(DisputeAuditLogModel).values(batch);
		}

		console.log(
			[
				"Seed complete:",
				`  users:              ${users.length} (1 admin, ${users.length - 1} customers)`,
				`  transactions:       ${transactions.length}`,
				`  disputes:           ${disputes.length}`,
				`  dispute audit rows: ${auditRows.length}`,
				"",
				`  admin login:    ${ADMIN.email}`,
				`  customer login: ${DEMO_CUSTOMER_EMAIL} (long history)`,
				`  customer login: ${NEWCOMER_EMAIL} (no disputes)`,
			].join("\n"),
		);
	} finally {
		await client.end();
	}
};

seed()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
