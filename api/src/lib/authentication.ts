import type { FastifyRequest } from "fastify";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.js";

interface EmailOtpRequestPayload {
	email: string;
}

interface EmailOtpSignInPayload {
	otp: string;
	email: string;
}

/**
 * Thin wrappers over the Better Auth server API. Better Auth talks to its own
 * HTTP-boundary API, so these sit alongside the Drizzle repos but can't join a
 * Drizzle transaction — they take request headers, never an `Executor`.
 */

/**
 * Send a one-time sign-in code to the given email.
 */
export const sendSignInOtp = async (
	headers: FastifyRequest["headers"],
	payload: EmailOtpRequestPayload,
): Promise<{ success: boolean }> =>
	await auth.api.sendVerificationOTP({
		headers: fromNodeHeaders(headers),
		body: { ...payload, type: "sign-in" },
	});

/**
 * Verify a sign-in code and, on success, establish a session. Returned as a
 * `Response` so the caller can forward its `set-cookie` header.
 */
export const verifySignInOtp = async (
	headers: FastifyRequest["headers"],
	payload: EmailOtpSignInPayload,
): Promise<Response> =>
	await auth.api.signInEmailOTP({
		headers: fromNodeHeaders(headers),
		asResponse: true,
		body: payload,
	});

/**
 * End the current session. Returned as a `Response` so the caller can forward
 * its `set-cookie` header.
 */
export const signOut = async (
	headers: FastifyRequest["headers"],
): Promise<Response> =>
	await auth.api.signOut({
		headers: fromNodeHeaders(headers),
		asResponse: true,
	});
