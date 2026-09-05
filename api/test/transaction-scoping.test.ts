import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

describe("transaction scoping", () => {
	let app: FastifyInstance;
	let data: SeededData;
	let alice: Session;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
		alice = await signIn(app, data.alice.email);
	});

	afterAll(async () => {
		await app.close();
	});

	it("returns only the caller's own transactions in the list", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/transactions",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(200);
		const ids: string[] = response.json().data.map((row: { id: string }) => row.id);
		expect(ids.sort()).toEqual([...data.aliceTransactionIds].sort());
		for (const bobId of data.bobTransactionIds) {
			expect(ids).not.toContain(bobId);
		}
	});

	it("404s when reading another user's transaction, not 403", async () => {
		const response = await app.inject({
			method: "GET",
			url: `/v1/transactions/${data.bobTransactionIds[0]}`,
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(404);
	});

	it("404s for a well-formed id that does not exist", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/transactions/00000000-0000-4000-8000-000000000000",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(404);
	});

	it("422s for a malformed id", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/transactions/not-a-uuid",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(422);
	});

	it("401s without a session", async () => {
		const response = await app.inject({ method: "GET", url: "/v1/transactions" });
		expect(response.statusCode).toBe(401);
	});
});
