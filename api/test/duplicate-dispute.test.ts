import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

const openDispute = (
	app: FastifyInstance,
	cookie: string,
	transactionId: string,
) =>
	app.inject({
		method: "POST",
		url: "/v1/disputes",
		headers: { cookie },
		payload: {
			transactionId,
			reason: "DUPLICATE_CHARGE",
			description: "Charged twice for one purchase.",
		},
	});

describe("duplicate dispute rejection", () => {
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

	it("rejects a second open dispute on the same transaction with 409", async () => {
		const transactionId = data.aliceTransactionIds[1];

		const first = await openDispute(app, alice.cookie, transactionId);
		expect(first.statusCode).toBe(201);

		const second = await openDispute(app, alice.cookie, transactionId);
		expect(second.statusCode).toBe(409);
	});

	it("collapses a burst of concurrent submits to exactly one insert", async () => {
		const transactionId = data.aliceTransactionIds[2];

		const responses = await Promise.all(
			Array.from({ length: 5 }, () =>
				openDispute(app, alice.cookie, transactionId),
			),
		);

		const created = responses.filter((r) => r.statusCode === 201);
		const conflicted = responses.filter((r) => r.statusCode === 409);

		expect(created).toHaveLength(1);
		expect(conflicted).toHaveLength(4);

		const list = await app.inject({
			method: "GET",
			url: "/v1/disputes?limit=100",
			headers: { cookie: alice.cookie },
		});
		const forTransaction = list
			.json()
			.data.filter(
				(row: { transaction_id: string }) =>
					row.transaction_id === transactionId,
			);
		expect(forTransaction).toHaveLength(1);
	});

	it("404s when disputing a transaction that isn't the caller's", async () => {
		const response = await openDispute(
			app,
			alice.cookie,
			data.bobTransactionIds[0],
		);
		expect(response.statusCode).toBe(404);
	});
});
