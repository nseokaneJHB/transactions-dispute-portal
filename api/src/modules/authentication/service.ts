import type { FastifyReply, FastifyRequest } from "fastify";

import {
	OTP,
	AUTH_EVENT,
	FRONTEND_URLS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";

import {
	signOut,
	sendSignInOtp,
	verifySignInOtp,
	requestEmailChange as requestEmailChangeApi,
	confirmEmailChange as confirmEmailChangeApi,
} from "../../lib/authentication.js";

import { recordAuthEvent } from "../../database/repository/index.js";

import type {
	SignOutRequest,
	RequestOtpRequest,
	VerifyOtpRequest,
	ChangeEmailRequest,
	ConfirmEmailChangeRequest,
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
		message: `If an account exists for ${email}, a sign-in code is on its way. It expires in ${OTP.EXPIRY_MINUTES} minutes.`,
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

/** `POST /v1/auth/change-email` — start moving the signed-in user's sign-in email. */
export const changeEmail = async (
	request: FastifyRequest<ChangeEmailRequest>,
	reply: FastifyReply<ChangeEmailRequest>,
): Promise<void> => {
	const { newEmail } = request.body;

	await requestEmailChangeApi(request.headers, { newEmail });

	await recordAuthEvent(request.server.connection, {
		email: request.user!.email,
		event: AUTH_EVENT.EMAIL_CHANGE_REQUESTED,
		userId: request.user!.id,
		ipAddress: request.ip,
		userAgent: request.headers["user-agent"],
	});

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message:
			"If that address is available, we've emailed an approval link to your current address. The change only takes effect once you follow it.",
	});
};

/** `POST /v1/auth/change-email/confirm` — apply one step of an email change from its token. */
export const confirmEmailChange = async (
	request: FastifyRequest<ConfirmEmailChangeRequest>,
	reply: FastifyReply<ConfirmEmailChangeRequest>,
): Promise<void> => {
	const result = await confirmEmailChangeApi(request.body.token);

	if (!result.ok) {
		const { status, code } = HTTP_RESPONSE_CODE.UNAUTHENTICATED;
		return reply.status(status).send({
			code,
			message: "That link is invalid or has expired. Start the change again.",
		});
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Email change confirmed.",
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
