import { asc, desc, eq, like, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encodeCursor } from "@transaction-dispute-portal/shared";

import { connection } from "../src/database/config.js";
import { DisputeModel, TransactionModel } from "../src/database/schema/index.js";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

/**
 * The shared list-query surface — `?search=`, `?from=` / `?to=`,
 * `?min_amount_cents=` / `?max_amount_cents=`, `?sort=` /
 * `?order=` — exercised across the customer and admin list endpoints that all
 * extend `paginationQuerySchema`.
 *
 * Seed (see `helpers/fixtures.ts`): Alice owns four transactions
 * `Merchant A0..A3` at 10000..13000 cents, dated 2026-01-01..04, and one
 * `SUBMITTED` dispute on `Merchant A0` reading "I did not make this charge."
 */
describe("list query: search, date range, sort", () => {
	let app: FastifyInstance;
	let data: SeededData;
	let alice: Session;
	let admin: Session;

	const get = (url: string, session: Session) =>
		app.inject({ method: "GET", url, headers: { cookie: session.cookie } });

	const merchantOf = (row: { merchant_name: string }) => row.merchant_name;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
		alice = await signIn(app, data.alice.email);
		admin = await signIn(app, data.admin.email);
	});

	afterAll(async () => {
		await app.close();
	});

	describe("GET /v1/transactions", () => {
		it("filters by a case-insensitive merchant substring", async () => {
			const response = await get("/v1/transactions?search=a1", alice);

			expect(response.statusCode).toBe(200);
			const merchants = response
				.json()
				.data.map((row: { merchant_name: string }) => row.merchant_name);
			expect(merchants).toEqual(["Merchant A1"]);
		});

		it("treats a LIKE metacharacter in the term as a literal", async () => {
			const response = await get("/v1/transactions?search=%25", alice);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toHaveLength(0);
		});

		it("bounds an inclusive date range on transacted_at", async () => {
			const response = await get(
				"/v1/transactions?from=2026-01-02&to=2026-01-03",
				alice,
			);

			expect(response.statusCode).toBe(200);
			const merchants = response
				.json()
				.data.map((row: { merchant_name: string }) => row.merchant_name)
				.sort();
			expect(merchants).toEqual(["Merchant A1", "Merchant A2"]);
		});

		it("sorts by a whitelisted column in the requested direction", async () => {
			const ascending = await get(
				"/v1/transactions?sort=amount_cents&order=asc",
				alice,
			);
			const descending = await get(
				"/v1/transactions?sort=amount_cents&order=desc",
				alice,
			);

			expect(ascending.json().data[0].amount_cents).toBe(10000);
			expect(descending.json().data[0].amount_cents).toBe(13000);
		});

		it("sorts by merchant name", async () => {
			const response = await get(
				"/v1/transactions?sort=merchant&order=desc",
				alice,
			);

			expect(response.statusCode).toBe(200);
			expect(response.json().data[0].merchant_name).toBe("Merchant A3");
		});

		it("422s a sort column that is not on the whitelist", async () => {
			const response = await get("/v1/transactions?sort=user_id", alice);
			expect(response.statusCode).toBe(422);
		});

		it("422s ?sort=status on transactions — not a sortable column there", async () => {
			const response = await get("/v1/transactions?sort=status", alice);
			expect(response.statusCode).toBe(422);
		});

		it("422s a reversed date range", async () => {
			const response = await get(
				"/v1/transactions?from=2026-02-01&to=2026-01-01",
				alice,
			);
			expect(response.statusCode).toBe(422);
		});

		it("returns the page and its cursors, with no match count", async () => {
			const body = (await get("/v1/transactions", alice)).json();

			expect(body.data).toHaveLength(4);
			expect(body).not.toHaveProperty("count");
			expect(body.next_cursor).toBeNull();
			expect(body.prev_cursor).toBeNull();
		});

		it("hands out cursors on the default order and seeks both ways with them", async () => {
			const first = (await get("/v1/transactions?limit=2", alice)).json();
			expect(first.data.map(merchantOf)).toEqual(["Merchant A3", "Merchant A2"]);
			expect(first.prev_cursor).toBeNull();

			const second = (
				await get(`/v1/transactions?limit=2&cursor=${first.next_cursor}`, alice)
			).json();
			expect(second.data.map(merchantOf)).toEqual(["Merchant A1", "Merchant A0"]);
			expect(second.next_cursor).toBeNull();

			const back = (
				await get(`/v1/transactions?limit=2&cursor=${second.prev_cursor}`, alice)
			).json();
			expect(back.data).toEqual(first.data);
			expect(back.prev_cursor).toBeNull();
		});

		it("hands out cursors under an explicit sort too", async () => {
			const first = (
				await get("/v1/transactions?limit=3&sort=merchant&order=asc", alice)
			).json();
			expect(first.data.map(merchantOf)).toEqual([
				"Merchant A0",
				"Merchant A1",
				"Merchant A2",
			]);

			const second = (
				await get(
					`/v1/transactions?limit=3&sort=merchant&order=asc&cursor=${first.next_cursor}`,
					alice,
				)
			).json();
			expect(second.data.map(merchantOf)).toEqual(["Merchant A3"]);
			expect(second.next_cursor).toBeNull();
		});

		it("lands on the true last page with cursor=last", async () => {
			const body = (
				await get("/v1/transactions?limit=3&cursor=last", alice)
			).json();

			expect(body.data.map(merchantOf)).toEqual([
				"Merchant A2",
				"Merchant A1",
				"Merchant A0",
			]);
			expect(body.next_cursor).toBeNull();
			expect(body.prev_cursor).not.toBeNull();
		});

		it("422s a cursor that is malformed, from another sort, from another list, or hand-edited", async () => {
			const { next_cursor } = (await get("/v1/transactions?limit=2", alice)).json();
			const editedValue = encodeCursor({
				direction: "next",
				sort: "amount_cents",
				order: "desc",
				values: ["not-a-number"],
				id: data.aliceTransactionIds[0]!,
			});

			const malformed = await get("/v1/transactions?cursor=next~soon~1", alice);
			const otherSort = await get(
				`/v1/transactions?sort=merchant&cursor=${next_cursor}`,
				alice,
			);
			const otherOrder = await get(
				`/v1/transactions?order=asc&cursor=${next_cursor}`,
				alice,
			);
			const otherList = await get(`/v1/admin/disputes?cursor=${next_cursor}`, admin);
			const edited = await get(
				`/v1/transactions?sort=amount_cents&cursor=${editedValue}`,
				alice,
			);

			expect(malformed.statusCode).toBe(422);
			expect(otherSort.statusCode).toBe(422);
			expect(otherOrder.statusCode).toBe(422);
			expect(otherList.statusCode).toBe(422);
			expect(edited.statusCode).toBe(422);
		});

		it("ignores a leftover ?page= — lists page by cursor only", async () => {
			const paged = (await get("/v1/transactions?limit=2&page=2", alice)).json();
			const first = (await get("/v1/transactions?limit=2", alice)).json();

			expect(paged.data).toEqual(first.data);
			expect(paged).not.toHaveProperty("page");
		});

		it("bounds an inclusive amount range on amount_cents", async () => {
			const response = await get(
				"/v1/transactions?min_amount_cents=11000&max_amount_cents=12000&sort=amount_cents&order=asc",
				alice,
			);

			expect(response.statusCode).toBe(200);
			const amounts = response
				.json()
				.data.map((row: { amount_cents: number }) => row.amount_cents);
			expect(amounts).toEqual([11000, 12000]);
		});

		it("accepts a one-sided amount bound", async () => {
			const response = await get(
				"/v1/transactions?min_amount_cents=12500",
				alice,
			);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toHaveLength(1);
		});

		it("422s a reversed amount range", async () => {
			const response = await get(
				"/v1/transactions?min_amount_cents=20000&max_amount_cents=10000",
				alice,
			);
			expect(response.statusCode).toBe(422);
		});

		it("422s a negative or non-integer amount", async () => {
			const negative = await get("/v1/transactions?min_amount_cents=-1", alice);
			const fractional = await get(
				"/v1/transactions?max_amount_cents=10.5",
				alice,
			);

			expect(negative.statusCode).toBe(422);
			expect(fractional.statusCode).toBe(422);
		});
	});

	describe("GET /v1/disputes", () => {
		it("matches on the dispute description", async () => {
			const response = await get("/v1/disputes?search=did not make", alice);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toHaveLength(1);
		});

		it("matches on the disputed merchant's name", async () => {
			const response = await get("/v1/disputes?search=merchant a0", alice);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toHaveLength(1);
		});

		it("returns nothing for a term that matches neither", async () => {
			const response = await get("/v1/disputes?search=groceries", alice);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toHaveLength(0);
		});

		it("bounds the disputed transaction's amount", async () => {
			const inRange = await get("/v1/disputes?max_amount_cents=10000", alice);
			const outOfRange = await get(
				"/v1/disputes?min_amount_cents=10001",
				alice,
			);

			expect(inRange.json().data).toHaveLength(1);
			expect(outOfRange.json().data).toHaveLength(0);
		});

		it("accepts ?sort=status — disputes order by the lifecycle enum", async () => {
			const response = await get("/v1/disputes?sort=status&order=asc", alice);
			expect(response.statusCode).toBe(200);
		});
	});

	describe("GET /v1/admin/disputes", () => {
		it("matches on the owning customer's email", async () => {
			const response = await get(
				`/v1/admin/disputes?search=${encodeURIComponent(data.alice.email)}`,
				admin,
			);

			expect(response.statusCode).toBe(200);
			expect(
				response
					.json()
					.data.every(
						(row: { user_id: string }) => row.user_id === data.alice.id,
					),
			).toBe(true);
			expect(response.json().data.length).toBeGreaterThan(0);
		});

		it("matches on the owning customer's name", async () => {
			const response = await get("/v1/admin/disputes?search=alice", admin);

			expect(response.statusCode).toBe(200);
			expect(response.json().data.length).toBeGreaterThan(0);
		});

		it("bounds the review queue by the disputed transaction's amount", async () => {
			const inRange = await get(
				"/v1/admin/disputes?min_amount_cents=10000&max_amount_cents=10000",
				admin,
			);
			const outOfRange = await get(
				"/v1/admin/disputes?min_amount_cents=50000",
				admin,
			);

			expect(inRange.statusCode).toBe(200);
			expect(inRange.json().data).toHaveLength(1);
			expect(outOfRange.json().data).toHaveLength(0);
		});

		it("accepts ?sort=customer on the review queue", async () => {
			const response = await get(
				"/v1/admin/disputes?sort=customer&order=asc",
				admin,
			);
			expect(response.statusCode).toBe(200);
		});

		it("422s ?sort=customer on a customer's own dispute list", async () => {
			const response = await get("/v1/disputes?sort=customer", alice);
			expect(response.statusCode).toBe(422);
		});
	});

	describe("GET /v1/admin/disputes/summary", () => {
		it("counts every dispute by status, zero-filling the rest", async () => {
			const response = await get("/v1/admin/disputes/summary", admin);

			expect(response.statusCode).toBe(200);
			expect(response.json().data).toEqual({
				SUBMITTED: 1,
				UNDER_REVIEW: 0,
				RESOLVED: 0,
				REJECTED: 0,
				WITHDRAWN: 0,
			});
		});
	});

	describe("GET /v1/admin/disputes — default priority ordering", () => {
		beforeAll(async () => {
			const created = await app.inject({
				method: "POST",
				url: "/v1/disputes",
				headers: { cookie: alice.cookie },
				payload: {
					transactionId: data.aliceTransactionIds[1],
					reason: "OTHER",
					description: "A newer dispute that is then withdrawn.",
				},
			});

			await app.inject({
				method: "POST",
				url: `/v1/disputes/${created.json().data.id}/withdraw`,
				headers: { cookie: alice.cookie },
			});
		});

		it("puts an unresolved dispute ahead of a newer terminal one", async () => {
			const response = await get("/v1/admin/disputes", admin);

			expect(response.statusCode).toBe(200);
			const statuses = response
				.json()
				.data.map((row: { status: string }) => row.status);
			expect(statuses).toEqual(["SUBMITTED", "WITHDRAWN"]);
		});

		it("an explicit ?sort overrides the priority ordering entirely", async () => {
			const response = await get(
				"/v1/admin/disputes?sort=created_at&order=desc",
				admin,
			);

			const statuses = response
				.json()
				.data.map((row: { status: string }) => row.status);
			expect(statuses).toEqual(["WITHDRAWN", "SUBMITTED"]);
		});
	});

	describe("GET /v1/admin/invites", () => {
		beforeAll(async () => {
			for (const email of ["zzz-late@test.local", "aaa-early@test.local"]) {
				await app.inject({
					method: "POST",
					url: "/v1/admin/invites",
					headers: { cookie: admin.cookie },
					payload: { email },
				});
			}
		});

		it("filters invites by an email substring", async () => {
			const response = await get("/v1/admin/invites?search=zzz-late", admin);

			expect(response.statusCode).toBe(200);
			expect(
				response.json().data.map((row: { email: string }) => row.email),
			).toEqual(["zzz-late@test.local"]);
		});

		it("sorts invites by email ascending", async () => {
			const response = await get(
				"/v1/admin/invites?sort=email&order=asc",
				admin,
			);

			expect(response.statusCode).toBe(200);
			const emails = response
				.json()
				.data.map((row: { email: string }) => row.email);
			expect(emails).toEqual([...emails].sort());
			expect(emails[0]).toBe("aaa-early@test.local");
		});

		it("orders by derived status (pending first) without erroring", async () => {
			const response = await get(
				"/v1/admin/invites?sort=status&order=asc",
				admin,
			);

			expect(response.statusCode).toBe(200);
			expect(response.json().data[0].status).toBe("PENDING");
		});
	});

	describe("keyset paging", () => {
		let bob: Session;

		/** Follow `key` from `url` until it runs out, returning each page's row ids. */
		const walk = async (
			path: string,
			session: Session,
			key: "next_cursor" | "prev_cursor",
			from?: string,
		): Promise<string[][]> => {
			const pages: string[][] = [];
			let cursor = from;

			for (;;) {
				const response = await get(
					cursor ? `${path}&cursor=${cursor}` : path,
					session,
				);
				const body = response.json();
				pages.push(body.data.map((row: { id: string }) => row.id));

				if (!body[key]) return pages;
				cursor = body[key];
			}
		};

		/**
		 * Walk `path` to its end, then back from `cursor=last`; both must cover the
		 * list `path` returns whole, in order. The pages themselves differ — read
		 * from the end, the short page is the first one rather than the last.
		 */
		const walkBothWays = async (path: string, session: Session) => {
			const whole = (
				await get(path.replace(/limit=\d+/, "limit=100"), session)
			).json();
			const forwards = await walk(path, session, "next_cursor");

			expect(forwards.flat()).toEqual(
				whole.data.map((row: { id: string }) => row.id),
			);
			expect(forwards.length).toBeGreaterThan(1);

			const backwards = await walk(
				path,
				session,
				"prev_cursor",
				"last",
			);
			expect(backwards.reverse().flat()).toEqual(forwards.flat());
		};

		beforeAll(async () => {
			bob = await signIn(app, data.bob.email);

			await connection.insert(TransactionModel).values(
				Array.from({ length: 2_500 }, (_, index) => ({
					user_id: data.bob.id,
					amount_cents: 500,
					merchant_name: `Bulk ${index}`,
					transacted_at: new Date("2026-03-01"),
				})),
			);

			await connection.insert(TransactionModel).values(
				[100, 200, 300].map((microseconds, index) => ({
					user_id: data.bob.id,
					amount_cents: 700,
					merchant_name: `Micro ${index + 1}`,
					transacted_at: sql`'2026-02-01T00:00:00Z'::timestamptz + ${microseconds} * interval '1 microsecond'`,
				})),
			);

			const bulk = await connection
				.select({ id: TransactionModel.id })
				.from(TransactionModel)
				.where(like(TransactionModel.merchant_name, "Bulk %"))
				.limit(7);

			await connection.insert(DisputeModel).values(
				(
					[
						"RESOLVED",
						"SUBMITTED",
						"UNDER_REVIEW",
						"SUBMITTED",
						"RESOLVED",
						"UNDER_REVIEW",
						"SUBMITTED",
					] as const
				).map((status, index) => ({
					user_id: data.bob.id,
					transaction_id: bulk[index]!.id,
					reason: "OTHER" as const,
					description: `Keyset dispute ${index}`,
					status,
				})),
			);
		});

		it("walks every transaction once, in order, across rows that share a timestamp", async () => {
			const expected = await connection
				.select({ id: TransactionModel.id })
				.from(TransactionModel)
				.where(eq(TransactionModel.user_id, data.bob.id))
				.orderBy(desc(TransactionModel.transacted_at), desc(TransactionModel.id));

			const pages = await walk("/v1/transactions?limit=100", bob, "next_cursor");

			expect(expected.length).toBeGreaterThan(2_500);
			expect(pages.flat()).toEqual(expected.map((row) => row.id));
		});

		it("walks a sorted list whose rows all tie on the sort value, breaking ties by id", async () => {
			const expected = await connection
				.select({ id: TransactionModel.id })
				.from(TransactionModel)
				.where(like(TransactionModel.merchant_name, "Bulk %"))
				.orderBy(asc(TransactionModel.amount_cents), asc(TransactionModel.id));

			const pages = await walk(
				"/v1/transactions?limit=100&search=Bulk&sort=amount_cents&order=asc",
				bob,
				"next_cursor",
			);

			expect(pages.flat()).toEqual(expected.map((row) => row.id));
		});

		it("keeps rows that differ only by microseconds apart", async () => {
			const pages = await walk(
				"/v1/transactions?limit=1&search=Micro",
				bob,
				"next_cursor",
			);

			expect(pages).toHaveLength(3);
			expect(new Set(pages.flat()).size).toBe(3);
		});

		it.each([
			["/v1/disputes?limit=2", () => bob],
			["/v1/disputes?limit=2&sort=status&order=asc", () => bob],
			["/v1/admin/disputes?limit=2", () => admin],
			["/v1/admin/disputes?limit=2&sort=customer&order=asc", () => admin],
			["/v1/admin/disputes?limit=2&sort=amount_cents&order=desc", () => admin],
			["/v1/admin/disputes?limit=2&sort=merchant&order=asc", () => admin],
			["/v1/transactions?limit=1&sort=amount_cents&order=asc", () => alice],
			["/v1/admin/invites?limit=1&sort=status&order=asc", () => admin],
			["/v1/admin/invites?limit=1&sort=email&order=desc", () => admin],
		])("walks %s forwards, and back from the last page, over the same pages", async (path, session) => {
			await walkBothWays(path, session());
		});
	});
});
