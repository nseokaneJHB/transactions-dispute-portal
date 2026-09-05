import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

const moveToReview = async (
	app: FastifyInstance,
	admin: Session,
	disputeId: string,
): Promise<void> => {
	const response = await app.inject({
		method: "POST",
		url: `/v1/admin/disputes/${disputeId}/review`,
		headers: { cookie: admin.cookie },
	});
	expect(response.statusCode).toBe(200);
};

describe("admin route authorization", () => {
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

	it("403s a customer session on the admin review queue", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/admin/disputes",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(403);
	});

	it("403s a customer session on resolve — it is not reachable without the admin role", async () => {
		const response = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${data.aliceOpenDisputeId}/resolve`,
			headers: { cookie: alice.cookie },
			payload: { resolution: "REJECTED", note: "trying to resolve my own dispute" },
		});

		expect(response.statusCode).toBe(403);
	});

	it("403s an admin session on a customer route", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/transactions",
			headers: { cookie: admin.cookie },
		});

		expect(response.statusCode).toBe(403);
	});

	it("lets an admin move a dispute to review and resolve it", async () => {
		await moveToReview(app, admin, data.aliceOpenDisputeId);

		const response = await app.inject({
			method: "POST",
			url: `/v1/admin/disputes/${data.aliceOpenDisputeId}/resolve`,
			headers: { cookie: admin.cookie },
			payload: { resolution: "RESOLVED", note: "Refunded in full." },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().data.status).toBe("RESOLVED");
		expect(response.json().data.user_id).toBe(data.alice.id);
	});

	it("401s the review queue without any session", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/admin/disputes",
		});

		expect(response.statusCode).toBe(401);
	});
});
