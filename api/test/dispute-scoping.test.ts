import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

describe("dispute scoping", () => {
	let app: FastifyInstance;
	let data: SeededData;
	let alice: Session;
	let bob: Session;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
		alice = await signIn(app, data.alice.email);
		bob = await signIn(app, data.bob.email);
	});

	afterAll(async () => {
		await app.close();
	});

	it("lets the owner read their own dispute", async () => {
		const response = await app.inject({
			method: "GET",
			url: `/v1/disputes/${data.aliceOpenDisputeId}`,
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().data.id).toBe(data.aliceOpenDisputeId);
	});

	it("404s when another customer reads a dispute that isn't theirs, not 403", async () => {
		const response = await app.inject({
			method: "GET",
			url: `/v1/disputes/${data.aliceOpenDisputeId}`,
			headers: { cookie: bob.cookie },
		});

		expect(response.statusCode).toBe(404);
	});

	it("never lists another customer's disputes", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/disputes",
			headers: { cookie: bob.cookie },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().data).toHaveLength(0);
	});

	it("422s for a malformed dispute id", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/disputes/not-a-uuid",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(422);
	});
});
