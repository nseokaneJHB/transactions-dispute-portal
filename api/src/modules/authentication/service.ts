import type { FastifyReply, FastifyRequest } from "fastify";

import {
	AUTH_EVENT,
	FRONTEND_URLS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";

import {
	signOut,
	sendSignInOtp,
	verifySignInOtp,
} from "../../lib/authentication.js";

import { recordAuthEvent } from "../../database/repository/index.js";

import type {
	SignOutRequest,
	RequestOtpRequest,
	VerifyOtpRequest,
} from "./type.js";

const TOO_MANY_ATTEMPTS_CODE = "TOO_MANY_ATTEMPTS";

interface OtpVerifyPayload {
	code?: string;
	user?: { id?: string };
}

const signInRedirect = (email: string): string =>
	`${FRONTEND_URLS.SIGN_IN}?${new URLSearchParams({ email }).toString()}`;

const forwardSessionCookies = (reply: FastifyReply, source: Response): void => {
	const cookies = source.headers.getSetCookie();
	if (cookies.length > 0) reply.header("set-cookie", cookies);
};

/** `POST /v1/auth/otp` — send a one-time sign-in code by email. */
export const requestOtp = async (
	request: FastifyRequest<RequestOtpRequest>,
	reply: FastifyReply<RequestOtpRequest>,
): Promise<void> => {
	const { email } = request.body;

	await sendSignInOtp(request.headers, { email });

	await recordAuthEvent(request.server.connection, {
		email,
		event: AUTH_EVENT.OTP_REQUESTED,
		ipAddress: request.ip,
		userAgent: request.headers["user-agent"],
	});

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: `If an account exists for ${email}, a sign-in code is on its way. It expires in 10 minutes.`,
		redirectUrl: signInRedirect(email),
	});
};

/** `POST /v1/auth/otp/verify` — exchange the emailed code for a session cookie. */
export const verifyOtp = async (
	request: FastifyRequest<VerifyOtpRequest>,
	reply: FastifyReply<VerifyOtpRequest>,
): Promise<void> => {
	const { email, otp } = request.body;

	const result = await verifySignInOtp(request.headers, { email, otp });
	forwardSessionCookies(reply, result);

	const payload = (await result
		.clone()
		.json()
		.catch(() => null)) as OtpVerifyPayload | null;

	const succeeded = result.status >= 200 && result.status < 300;
	const lockedOut = payload?.code === TOO_MANY_ATTEMPTS_CODE;

	await recordAuthEvent(request.server.connection, {
		email,
		event: succeeded
			? AUTH_EVENT.LOGIN_SUCCESS
			: lockedOut
				? AUTH_EVENT.OTP_LOCKED
				: AUTH_EVENT.LOGIN_FAILURE,
		userId: succeeded ? payload?.user?.id : null,
		ipAddress: request.ip,
		userAgent: request.headers["user-agent"],
	});

	if (succeeded) {
		const { status, code } = HTTP_RESPONSE_CODE.OK;
		return reply.status(status).send({
			code,
			message: "Signed in.",
			redirectUrl: FRONTEND_URLS.HOME,
		});
	}

	const { status, code } = lockedOut
		? HTTP_RESPONSE_CODE.TOO_MANY_REQUESTS
		: HTTP_RESPONSE_CODE.UNAUTHENTICATED;
	return reply.status(status).send({
		code,
		message: lockedOut
			? "Too many incorrect attempts — that code is now void. Request a new one."
			: "That code is invalid or has expired. Request a new one.",
		redirectUrl: signInRedirect(email),
	});
};

/** `POST /v1/auth/sign-out` — end the current session. */
export const endSession = async (
	request: FastifyRequest<SignOutRequest>,
	reply: FastifyReply<SignOutRequest>,
): Promise<void> => {
	const result = await signOut(request.headers);
	forwardSessionCookies(reply, result);

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Signed out.",
		redirectUrl: FRONTEND_URLS.SIGN_IN,
	});
};
