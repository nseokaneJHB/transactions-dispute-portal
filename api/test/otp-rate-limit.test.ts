import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OTP } from "@transaction-dispute-portal/shared";

import { connection } from "../src/database/config.js";
import { AuthAuditLogModel } from "../src/database/schema/index.js";

import { createTestApp } from "./helpers/app.js";
import { resetDatabase, type SeededData } from "./helpers/fixtures.js";
import { clearInbox, extractOtp, waitForEmail } from "./helpers/mailpit.js";

const requestOtp = (app: FastifyInstance, email: string, ip: string) =>
	app.inject({
		method: "POST",
		url: "/v1/auth/otp",
		headers: { "x-forwarded-for": ip },
		payload: { email },
	});

const verifyOtp = (
	app: FastifyInstance,
	email: string,
	otp: string,
	ip: string,
) =>
	app.inject({
		method: "POST",
		url: "/v1/auth/otp/verify",
		headers: { "x-forwarded-for": ip },
		payload: { email, otp },
	});

const eventsFor = async (email: string): Promise<string[]> => {
	const rows = await connection
		.select({ event: AuthAuditLogModel.event })
		.from(AuthAuditLogModel)
		.where(eq(AuthAuditLogModel.email, email));
	return rows.map((row) => row.event);
};

describe("OTP rate limiting and audit events", () => {
	let app: FastifyInstance;
	let data: SeededData;

	beforeAll(async () => {
		app = await createTestApp();
		data = await resetDatabase();
	});

	afterAll(async () => {
		await app.close();
	});

	it("caps OTP requests per IP and writes an OTP_REQUESTED row each time", async () => {
		const ip = "203.0.113.10";

		const statuses: number[] = [];
		for (let attempt = 0; attempt < OTP.MAX_ATTEMPTS + 1; attempt += 1) {
			statuses.push((await requestOtp(app, data.alice.email, ip)).statusCode);
		}

		expect(statuses.slice(0, OTP.MAX_ATTEMPTS).every((s) => s === 200)).toBe(true);
		expect(statuses.at(-1)).toBe(429);

		const events = await eventsFor(data.alice.email);
		expect(events.filter((e) => e === "OTP_REQUESTED")).toHaveLength(
			OTP.MAX_ATTEMPTS,
		);
	});

	it("locks a code after too many wrong attempts and records it", async () => {
		const ip = "203.0.113.20";
		await clearInbox();

		await requestOtp(app, data.bob.email, ip);
		const realOtp = extractOtp(
			await waitForEmail({ to: data.bob.email, subjectIncludes: "sign-in code" }),
		);
		const wrongOtp = realOtp === "000000" ? "111111" : "000000";

		const statuses: number[] = [];
		for (let attempt = 0; attempt < OTP.MAX_ATTEMPTS + 1; attempt += 1) {
			statuses.push(
				(await verifyOtp(app, data.bob.email, wrongOtp, ip)).statusCode,
			);
		}

		expect(statuses.some((s) => s === 429)).toBe(true);

		const events = await eventsFor(data.bob.email);
		expect(events).toContain("LOGIN_FAILURE");
		expect(events).toContain("OTP_LOCKED");

		const afterLock = await verifyOtp(app, data.bob.email, realOtp, ip);
		expect(afterLock.statusCode).not.toBe(200);
	});
});
