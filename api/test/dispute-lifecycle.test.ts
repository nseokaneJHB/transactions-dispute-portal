import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connection } from "../src/database/config.js";
import { DisputeAuditLogModel } from "../src/database/schema/index.js";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

const submit = async (
	app: FastifyInstance,
	cookie: string,
	transactionId: string,
): Promise<string> => {
	const response = await app.inject({
		method: "POST",
		url: "/v1/disputes",
		headers: { cookie },
		payload: {
			transactionId,
			reason: "OTHER",
			description: "Please review this charge.",
		},
	});
	expect(response.statusCode).toBe(201);
	return response.json().data.id;
};

describe("dispute lifecycle transitions", () => {
	let app: FastifyInstance;
	let data: SeededData;
	let alice: Session;
	let admin: Session;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
		alice = await signIn(app, data.alice.email);
		admin = await signIn(app, data.admin.email);
	});

	afterAll(async () => {
		await app.close();
	});

	it("refuses to resolve a dispute that is still SUBMITTED", async () => {
		const response = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${data.aliceOpenDisputeId}/resolve`,
			headers: { cookie: admin.cookie },
			payload: { resolution: "RESOLVED", note: "too early" },
		});

		expect(response.statusCode).toBe(409);
	});

	it("runs SUBMITTED -> UNDER_REVIEW -> RESOLVED and is idempotent on review", async () => {
		const id = data.aliceOpenDisputeId;

		const review = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/review`,
			headers: { cookie: admin.cookie },
		});
		expect(review.statusCode).toBe(200);
		expect(review.json().data.status).toBe("UNDER_REVIEW");

		const reviewAgain = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/review`,
			headers: { cookie: admin.cookie },
		});
		expect(reviewAgain.statusCode).toBe(200);

		const resolve = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/resolve`,
			headers: { cookie: admin.cookie },
			payload: { resolution: "RESOLVED", note: "Refund issued." },
		});
		expect(resolve.statusCode).toBe(200);

		const resolveAgain = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/resolve`,
			headers: { cookie: admin.cookie },
			payload: { resolution: "REJECTED", note: "changed my mind" },
		});
		expect(resolveAgain.statusCode).toBe(409);
	});

	it("lets the customer withdraw an open dispute, from either open state", async () => {
		const fromSubmitted = await submit(
			app,
			alice.cookie,
			data.aliceTransactionIds[1],
		);
		const withdrawA = await app.inject({
			method: "POST",
			url: `/v1/disputes/${fromSubmitted}/withdraw`,
			headers: { cookie: alice.cookie },
		});
		expect(withdrawA.statusCode).toBe(200);
		expect(withdrawA.json().data.status).toBe("WITHDRAWN");

		const fromReview = await submit(
			app,
			alice.cookie,
			data.aliceTransactionIds[2],
		);
		await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${fromReview}/review`,
			headers: { cookie: admin.cookie },
		});
		const withdrawB = await app.inject({
			method: "POST",
			url: `/v1/disputes/${fromReview}/withdraw`,
			headers: { cookie: alice.cookie },
		});
		expect(withdrawB.statusCode).toBe(200);
	});

	it("records the true from-status when a dispute is withdrawn out of review", async () => {
		const id = await submit(app, alice.cookie, data.aliceTransactionIds[3]);

		await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/review`,
			headers: { cookie: admin.cookie },
		});

		const withdraw = await app.inject({
			method: "POST",
			url: `/v1/disputes/${id}/withdraw`,
			headers: { cookie: alice.cookie },
		});
		expect(withdraw.statusCode).toBe(200);

		const [row] = await connection
			.select({
				from_status: DisputeAuditLogModel.from_status,
				to_status: DisputeAuditLogModel.to_status,
			})
			.from(DisputeAuditLogModel)
			.where(
				and(
					eq(DisputeAuditLogModel.dispute_id, id),
					eq(DisputeAuditLogModel.to_status, "WITHDRAWN"),
				),
			);

		expect(row?.from_status).toBe("UNDER_REVIEW");
	});

	it("409s a second withdraw and blocks admin review of a withdrawn dispute", async () => {
		const id = await submit(app, alice.cookie, data.aliceTransactionIds[3]);

		const first = await app.inject({
			method: "POST",
			url: `/v1/disputes/${id}/withdraw`,
			headers: { cookie: alice.cookie },
		});
		expect(first.statusCode).toBe(200);

		const second = await app.inject({
			method: "POST",
			url: `/v1/disputes/${id}/withdraw`,
			headers: { cookie: alice.cookie },
		});
		expect(second.statusCode).toBe(409);

		const review = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${id}/review`,
			headers: { cookie: admin.cookie },
		});
		expect(review.statusCode).toBe(409);
	});

	it("lets the customer open a fresh dispute once the prior one is closed", async () => {
		const transactionId = data.aliceTransactionIds[1];

		const reopened = await app.inject({
			method: "POST",
			url: "/v1/disputes",
			headers: { cookie: alice.cookie },
			payload: {
				transactionId,
				reason: "OTHER",
				description: "New evidence has come to light.",
			},
		});

		expect(reopened.statusCode).toBe(201);
		expect(reopened.json().data.status).toBe("SUBMITTED");
	});

	it("404s withdraw on another user's dispute", async () => {
		const bob = await signIn(app, data.bob.email);
		const response = await app.inject({
			method: "POST",
			url: `/v1/disputes/${data.aliceOpenDisputeId}/withdraw`,
			headers: { cookie: bob.cookie },
		});
		expect(response.statusCode).toBe(404);
	});
});
