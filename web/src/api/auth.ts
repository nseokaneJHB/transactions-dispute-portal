import { createServerFn } from "@tanstack/react-start";

import {
	API_URLS,
	API_PATHS,
	buildUrlWithParams,
	type GlobalResponse,
	type AuthSessionResponse,
	type AuthOtpRequestBody,
	type AuthOtpVerifyBody,
	type AuthChangeEmailBody,
	type AuthChangeEmailConfirmBody,
	type AdminInviteAcceptBody,
} from "@transaction-dispute-portal/shared";

import { api } from "@/api";
import { forwardCookie } from "@/api/server";

import { env } from "@/lib/env";

const authUrl = API_URLS(env.VITE_API_VERSION).AUTH;
const adminUrl = API_URLS(env.VITE_API_VERSION).ADMIN;

/**
 * The signed-in user. Runs on the server during SSR (forwarding the session
 * cookie) and on the client afterwards — the router's `beforeLoad` seeds it
 * once into the query cache.
 */
export const sessionRequest = createServerFn({ method: "GET" }).handler(
	async (): Promise<AuthSessionResponse> => {
		const { data } = await api.get<AuthSessionResponse>(
			`${authUrl}${API_PATHS.AUTH_SESSION}`,
			forwardCookie(),
		);
		return data;
	},
);

/** Step 1 of sign-in — email a one-time code. */
export const requestOtp = async (
	payload: AuthOtpRequestBody,
): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		`${authUrl}${API_PATHS.AUTH_OTP_REQUEST}`,
		payload,
	);
	return data;
};

/** Step 2 of sign-in — exchange the code for a session cookie (client-only, reads `Set-Cookie`). */
export const verifyOtp = async (
	payload: AuthOtpVerifyBody,
): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		`${authUrl}${API_PATHS.AUTH_OTP_VERIFY}`,
		payload,
	);
	return data;
};

export const signOut = async (): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		`${authUrl}${API_PATHS.AUTH_SIGN_OUT}`,
		null,
	);
	return data;
};

export const requestEmailChange = async (
	payload: AuthChangeEmailBody,
): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		`${authUrl}${API_PATHS.AUTH_CHANGE_EMAIL}`,
		payload,
	);
	return data;
};

export const confirmEmailChange = async (
	payload: AuthChangeEmailConfirmBody,
): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		`${authUrl}${API_PATHS.AUTH_CHANGE_EMAIL_CONFIRM}`,
		payload,
	);
	return data;
};

type AcceptAdminInvitePayload = AdminInviteAcceptBody & {
	token: string;
};

export const acceptAdminInvite = async ({
	token,
	...payload
}: AcceptAdminInvitePayload): Promise<GlobalResponse> => {
	const { data } = await api.post<GlobalResponse>(
		buildUrlWithParams(`${adminUrl}${API_PATHS.ADMIN_INVITE_ACCEPT}`, {
			token,
		}),
		payload,
	);
	return data;
};
