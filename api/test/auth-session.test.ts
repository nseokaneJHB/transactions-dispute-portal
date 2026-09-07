import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { USER_ROLE } from "@transaction-dispute-portal/shared";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";

describe("GET /v1/auth/session", () => {
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

	it("401s with a redirect when there is no session", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/auth/session",
		});

		expect(response.statusCode).toBe(401);
		expect(response.json().redirectUrl).toBe("/sign-in");
	});

	it("returns the signed-in customer with their role", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/auth/session",
			headers: { cookie: alice.cookie },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().data).toMatchObject({
			id: data.alice.id,
			email: data.alice.email,
			role: USER_ROLE.CUSTOMER,
		});
	});

	it("reports the admin role for an admin session", async () => {
		const response = await app.inject({
			method: "GET",
			url: "/v1/auth/session",
			headers: { cookie: admin.cookie },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json().data.role).toBe(USER_ROLE.ADMIN);
	});
});
