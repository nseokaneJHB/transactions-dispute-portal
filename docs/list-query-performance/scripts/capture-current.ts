import { writeFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
	adminDisputesQuerySchema,
	disputesQuerySchema,
	encodeCursor,
	transactionsQuerySchema,
} from "@transaction-dispute-portal/shared";

import * as schema from "./src/database/schema/index.js";
import { findDisputesByUser, findDisputesForReview } from "./src/database/repository/dispute.js";
import { findTransactionsByUser } from "./src/database/repository/transaction.js";

const client = postgres("postgresql://postgres:password@localhost:5432/perf_evidence", { prepare: false, max: 2 });
let captured: { sql: string; params: unknown[] } = { sql: "", params: [] };
const connection = drizzle(client, { schema, casing: "snake_case", logger: { logQuery: (sql, params) => (captured = { sql, params }) } });

const [{ heavy, normal }] = await client`select heavy_id::text heavy, normal_id::text normal from people`;
const TS = (e: string) => `to_char(${e} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const ADMIN_FROM = `dispute d join transaction t on d.transaction_id = t.id join "user" u on d.user_id = u.id`;
const CD_FROM = "dispute d join transaction t on d.transaction_id = t.id";
const SEARCH = "(d.description ilike '%merchant 42%' or t.merchant_name ilike '%merchant 42%' or u.name ilike '%merchant 42%' or u.email ilike '%merchant 42%')";

type Key = { e: string; ts?: boolean; dir: "asc" | "desc" };
const queue: Key[] = [{ e: "d.status", dir: "asc" }, { e: "d.created_at", ts: true, dir: "asc" }, { e: "d.id", dir: "desc" }];
const by = (e: string, id: string, dir: "asc" | "desc", ts = false): Key[] => [{ e, ts, dir }, { e: id, dir }];

type Case = [label: string, list: "tx" | "cd" | "ad", raw: Record<string, string | undefined>, user: string | undefined, from: string, where: string, keys: Key[], sortToken: string, offset: number];
const cases: Case[] = [
	["P01 admin queue, first page", "ad", {}, undefined, ADMIN_FROM, "true", queue, "queue", 0],
	["P02 admin queue, row 10,000", "ad", {}, undefined, ADMIN_FROM, "true", queue, "queue", 9990],
	["P03 admin queue, row 500,000", "ad", {}, undefined, ADMIN_FROM, "true", queue, "queue", 499990],
	["P04 admin queue status=SUBMITTED, first page", "ad", { status: "SUBMITTED" }, undefined, ADMIN_FROM, "d.status = 'SUBMITTED'", queue, "queue", 0],
	["P05 admin search 'merchant 42', first page", "ad", { search: "merchant 42" }, undefined, ADMIN_FROM, SEARCH, queue, "queue", 0],
	["P06 heavy customer transactions, first page", "tx", {}, heavy, "transaction t", `t.user_id = '${heavy}'`, by("t.transacted_at", "t.id", "desc", true), "transacted_at", 0],
	["P07 heavy customer transactions, row 10,000", "tx", {}, heavy, "transaction t", `t.user_id = '${heavy}'`, by("t.transacted_at", "t.id", "desc", true), "transacted_at", 9990],
	["P08 heavy customer transactions, row 100,000", "tx", {}, heavy, "transaction t", `t.user_id = '${heavy}'`, by("t.transacted_at", "t.id", "desc", true), "transacted_at", 99990],
	["P09 heavy customer disputes, first page", "cd", {}, heavy, CD_FROM, `d.user_id = '${heavy}'`, by("d.created_at", "d.id", "desc", true), "created_at", 0],
	["P10 heavy customer disputes, row 10,000", "cd", {}, heavy, CD_FROM, `d.user_id = '${heavy}'`, by("d.created_at", "d.id", "desc", true), "created_at", 9990],
	["P11 heavy customer disputes, row 40,000", "cd", {}, heavy, CD_FROM, `d.user_id = '${heavy}'`, by("d.created_at", "d.id", "desc", true), "created_at", 39990],
	["P12 normal customer transactions, first page", "tx", {}, normal, "transaction t", `t.user_id = '${normal}'`, by("t.transacted_at", "t.id", "desc", true), "transacted_at", 0],
	["P13 normal customer disputes, first page", "cd", {}, normal, CD_FROM, `d.user_id = '${normal}'`, by("d.created_at", "d.id", "desc", true), "created_at", 0],
	["S01 admin sort=amount desc, first page", "ad", { sort: "amount_cents", order: "desc" }, undefined, ADMIN_FROM, "true", by("t.amount_cents", "d.id", "desc"), "amount_cents", 0],
	["S02 admin sort=amount desc, row 10,000", "ad", { sort: "amount_cents", order: "desc" }, undefined, ADMIN_FROM, "true", by("t.amount_cents", "d.id", "desc"), "amount_cents", 9990],
	["S03 admin sort=amount desc, row 500,000", "ad", { sort: "amount_cents", order: "desc" }, undefined, ADMIN_FROM, "true", by("t.amount_cents", "d.id", "desc"), "amount_cents", 499990],
	["S04 admin sort=customer asc, first page", "ad", { sort: "customer", order: "asc" }, undefined, ADMIN_FROM, "true", by("u.name", "d.id", "asc"), "customer", 0],
	["S05 admin sort=customer asc, row 10,000", "ad", { sort: "customer", order: "asc" }, undefined, ADMIN_FROM, "true", by("u.name", "d.id", "asc"), "customer", 9990],
	["S06 admin sort=status asc, first page", "ad", { sort: "status", order: "asc" }, undefined, ADMIN_FROM, "true", by("d.status", "d.id", "asc"), "status", 0],
	["S07 admin sort=status asc, row 10,000", "ad", { sort: "status", order: "asc" }, undefined, ADMIN_FROM, "true", by("d.status", "d.id", "asc"), "status", 9990],
	["S08 heavy customer transactions sort=amount asc, first page", "tx", { sort: "amount_cents", order: "asc" }, heavy, "transaction t", `t.user_id = '${heavy}'`, by("t.amount_cents", "t.id", "asc"), "amount_cents", 0],
	["S09 heavy customer transactions sort=amount asc, row 10,000", "tx", { sort: "amount_cents", order: "asc" }, heavy, "transaction t", `t.user_id = '${heavy}'`, by("t.amount_cents", "t.id", "asc"), "amount_cents", 9990],
	["S10 heavy customer disputes sort=merchant asc, first page", "cd", { sort: "merchant", order: "asc" }, heavy, CD_FROM, `d.user_id = '${heavy}'`, by("t.merchant_name", "d.id", "asc"), "merchant", 0],
	["S11 heavy customer disputes sort=merchant asc, row 10,000", "cd", { sort: "merchant", order: "asc" }, heavy, CD_FROM, `d.user_id = '${heavy}'`, by("t.merchant_name", "d.id", "asc"), "merchant", 9990],
];

const inline = (sql: string, params: unknown[]) =>
	params.reduceRight<string>((text, value, index) => text.replaceAll(`$${index + 1}`, typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`), sql);

const lines: string[] = [];
for (const [label, list, raw, user, from, where, keys, sortToken, offset] of cases) {
	let cursor: string | undefined;
	if (offset > 0) {
		const order = keys.map((k) => `${k.e} ${k.dir}`).join(", ");
		const [anchor] = await client.unsafe(`select array[${keys.map((k) => (k.ts ? TS(k.e) : `(${k.e})::text`)).join(", ")}] seek from ${from} where ${where} order by ${order} offset ${offset - 1} limit 1`);
		const seek = anchor!.seek as string[];
		cursor = encodeCursor({ direction: "next", sort: sortToken, order: (raw.order as "asc" | "desc") ?? "desc", values: seek.slice(0, -1), id: seek.at(-1)! });
	}
	const query = { limit: "10", ...raw, cursor };
	const page =
		list === "tx" ? await findTransactionsByUser(connection, { ...transactionsQuerySchema.parse(query), userId: user! })
		: list === "cd" ? await findDisputesByUser(connection, { ...disputesQuerySchema.parse(query), userId: user! })
		: await findDisputesForReview(connection, adminDisputesQuerySchema.parse(query));
	if (page.rows.length !== 10) throw new Error(`${label}: ${page.rows.length} rows`);
	lines.push(`${label}\t${inline(captured.sql, captured.params).replace(/\s+/g, " ")}`);
}
writeFileSync(process.argv[2]!, lines.join("\n") + "\n");
await client.end();
