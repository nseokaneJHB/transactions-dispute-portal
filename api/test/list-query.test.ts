import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

/**
 * The shared list-query surface — `?search=`, `?from=` / `?to=`, `?sort=` /
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
					.data.every((row: { user_id: string }) => row.user_id === data.alice.id),
			).toBe(true);
			expect(response.json().data.length).toBeGreaterThan(0);
		});

		it("matches on the owning customer's name", async () => {
			const response = await get("/v1/admin/disputes?search=alice", admin);

			expect(response.statusCode).toBe(200);
			expect(response.json().data.length).toBeGreaterThan(0);
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
			const response = await get(
				"/v1/admin/invites?search=zzz-late",
				admin,
			);

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
});
