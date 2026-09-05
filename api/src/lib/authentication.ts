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

/** Send a one-time sign-in code to the given email. */
export const sendSignInOtp = async (
	headers: FastifyRequest["headers"],
	payload: EmailOtpRequestPayload,
): Promise<{ success: boolean }> =>
	await auth.api.sendVerificationOTP({
		headers: fromNodeHeaders(headers),
		body: { ...payload, type: "sign-in" },
	});

/** Verify a sign-in code and, on success, establish a session. */
export const verifySignInOtp = async (
	headers: FastifyRequest["headers"],
	payload: EmailOtpSignInPayload,
): Promise<Response> =>
	await auth.api.signInEmailOTP({
		headers: fromNodeHeaders(headers),
		asResponse: true,
		body: payload,
	});

/** End the current session. */
export const signOut = async (
	headers: FastifyRequest["headers"],
): Promise<Response> =>
	await auth.api.signOut({
		headers: fromNodeHeaders(headers),
		asResponse: true,
	});

/**
 * Start an email change for the signed-in user. Better Auth emails an approval
 * link to the *current* address; nothing changes until it is followed. The
 * response is the same whether or not `newEmail` is already taken.
 */
export const requestEmailChange = async (
	headers: FastifyRequest["headers"],
	payload: { newEmail: string },
): Promise<{ status: boolean }> =>
	await auth.api.changeEmail({
		headers: fromNodeHeaders(headers),
		body: { newEmail: payload.newEmail },
	});

/**
 * Complete an email-change step from a token in one of the two emails —
 * approval from the old address, then verification from the new one.
 */
export const confirmEmailChange = async (token: string): Promise<Response> =>
	await auth.api.verifyEmail({
		query: { token },
		asResponse: true,
	});
