import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/app.js";
import { signIn, type Session } from "./helpers/auth.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";
import { clearInbox, extractToken, waitForEmail } from "./helpers/mailpit.js";

const invite = (app: FastifyInstance, admin: Session, email: string) =>
	app.inject({
		method: "POST",
		url: "/v1/admin/invites",
		headers: { cookie: admin.cookie },
		payload: { email },
	});

const accept = (app: FastifyInstance, token: string, name = "New Admin") =>
	app.inject({
		method: "POST",
		url: `/v1/admin/invites/${token}/accept`,
		payload: { name },
	});

describe("admin invites", () => {
	let app: FastifyInstance;
	let data: SeededData;
	let admin: Session;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
		admin = await signIn(app, data.admin.email);
	});

	afterAll(async () => {
		await app.close();
	});

	it("403s a non-admin trying to send an invite", async () => {
		const alice = await signIn(app, data.alice.email);
		const response = await invite(app, alice, "someone@test.local");
		expect(response.statusCode).toBe(403);
	});

	it("409s inviting an address that already has an account", async () => {
		const response = await invite(app, admin, data.alice.email);
		expect(response.statusCode).toBe(409);
	});

	it("sends an invite and creates an ADMIN account on accept", async () => {
		await clearInbox();
		const email = "invitee@test.local";

		const sent = await invite(app, admin, email);
		expect(sent.statusCode).toBe(201);
		expect(sent.json().data).not.toHaveProperty("token");

		const body = await waitForEmail({ to: email, subjectIncludes: "invited" });
		const token = extractToken(body);

		const accepted = await accept(app, token, "Invited Admin");
		expect(accepted.statusCode).toBe(200);

		const session = await signIn(app, email);
		const adminRoute = await app.inject({
			method: "GET",
			url: "/v1/admin/disputes",
			headers: { cookie: session.cookie },
		});
		expect(adminRoute.statusCode).toBe(200);
	});

	it("404s an unknown token and 409s a used one", async () => {
		await clearInbox();
		const email = "invitee2@test.local";
		await invite(app, admin, email);
		const token = extractToken(
			await waitForEmail({ to: email, subjectIncludes: "invited" }),
		);

		expect((await accept(app, "no-such-token")).statusCode).toBe(404);

		expect((await accept(app, token)).statusCode).toBe(200);
		expect((await accept(app, token)).statusCode).toBe(409);
	});

	it("collapses concurrent accepts of one token to a single success", async () => {
		await clearInbox();
		const email = "invitee3@test.local";
		await invite(app, admin, email);
		const token = extractToken(
			await waitForEmail({ to: email, subjectIncludes: "invited" }),
		);

		const results = await Promise.all(
			Array.from({ length: 5 }, () => accept(app, token, "Race Admin")),
		);

		expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
		expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
	});
});
