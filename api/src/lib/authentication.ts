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
