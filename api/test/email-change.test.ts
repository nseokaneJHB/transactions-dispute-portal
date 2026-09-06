import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connection } from "../src/database/config.js";
import { AuthAuditLogModel } from "../src/database/schema/index.js";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";
import { clearInbox, waitForEmail } from "./helpers/mailpit.js";

describe("email change", () => {
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

	it("401s an unauthenticated change-email request", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/v1/auth/change-email",
			payload: { newEmail: "someone-else@test.local" },
		});

		expect(response.statusCode).toBe(401);
	});

	it("emails an approval link to the current address and audits the request", async () => {
		await clearInbox();

		const response = await app.inject({
			method: "POST",
			url: "/v1/auth/change-email",
			headers: { cookie: alice.cookie, "x-forwarded-for": alice.ip },
			payload: { newEmail: "alice-moved@test.local" },
		});

		expect(response.statusCode).toBe(200);

		const approval = await waitForEmail({
			to: data.alice.email,
			subjectIncludes: "Approve the email change",
		});
		expect(approval).toContain("alice-moved@test.local");

		const events = await connection
			.select({ event: AuthAuditLogModel.event })
			.from(AuthAuditLogModel)
			.where(eq(AuthAuditLogModel.email, data.alice.email));

		expect(events.map((row) => row.event)).toContain("EMAIL_CHANGE_REQUESTED");
	});
});
