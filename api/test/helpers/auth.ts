import type { FastifyInstance } from "fastify";

import { API_PATHS } from "@transaction-dispute-portal/shared";

import { clearInbox, extractOtp, waitForEmail } from "./mailpit.js";

const AUTH_BASE = "/v1/auth";
const TEST_USER_AGENT = "vitest-suite";

let ipSeed = 0;

/** A fresh caller IP per sign-in so per-route rate limits don't bleed across tests. */
export const nextIp = (): string => {
	ipSeed += 1;
	return `10.20.${Math.floor(ipSeed / 250) % 250}.${(ipSeed % 250) + 1}`;
};

export interface Session {
	cookie: string;
	ip: string;
}

const cookieHeader = (setCookie: string | string[] | undefined): string => {
	const values = Array.isArray(setCookie)
		? setCookie
		: setCookie
			? [setCookie]
			: [];
	return values.map((value) => value.split(";")[0]).join("; ");
};

/** Drive the real OTP flow (Mailpit) and return the session cookie for `inject()`. */
export const signIn = async (
	app: FastifyInstance,
	email: string,
): Promise<Session> => {
	const ip = nextIp();
	const headers = { "x-forwarded-for": ip, "user-agent": TEST_USER_AGENT };

	await clearInbox();

	const request = await app.inject({
		method: "POST",
		url: `${AUTH_BASE}${API_PATHS.AUTH_OTP_REQUEST}`,
		headers,
		payload: { email },
	});
	if (request.statusCode !== 200) {
		throw new Error(`OTP request failed: ${request.statusCode} ${request.body}`);
	}

	const body = await waitForEmail({ to: email, subjectIncludes: "sign-in code" });
	const otp = extractOtp(body);

	const verify = await app.inject({
		method: "POST",
		url: `${AUTH_BASE}${API_PATHS.AUTH_OTP_VERIFY}`,
		headers,
		payload: { email, otp },
	});
	if (verify.statusCode !== 200) {
		throw new Error(`OTP verify failed: ${verify.statusCode} ${verify.body}`);
	}

	return { cookie: cookieHeader(verify.headers["set-cookie"]), ip };
};
