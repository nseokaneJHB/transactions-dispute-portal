import axios, { AxiosError } from "axios";
import { notFound } from "@tanstack/react-router";

import type { GlobalResponse } from "@transaction-dispute-portal/shared";

import { env } from "@/lib/env";

const CLIENT_ERROR = {
	NETWORK_ERROR: "NETWORK_ERROR",
	UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

type ClientErrorCode = (typeof CLIENT_ERROR)[keyof typeof CLIENT_ERROR];

/** The normalized shape every failed request rejects with. */
interface ApiErrorResponse {
	status: number;
	message: string;
	code: GlobalResponse["code"] | ClientErrorCode | string;
	errors?: GlobalResponse["errors"];
	redirectUrl?: GlobalResponse["redirectUrl"];
}

/** A single error type for the whole app — server envelope, network, or unknown. */
export class ApiError extends Error {
	public readonly status: number;
	public readonly code: ApiErrorResponse["code"];
	public readonly errors?: ApiErrorResponse["errors"];
	public readonly redirectUrl?: ApiErrorResponse["redirectUrl"];

	constructor(response: ApiErrorResponse) {
		super(response.message);
		this.name = "ApiError";
		this.status = response.status;
		this.code = response.code;
		this.errors = response.errors;
		this.redirectUrl = response.redirectUrl;
	}
}

export const isApiError = (error: unknown): error is ApiError =>
	error instanceof ApiError;

const isEnvelope = (data: unknown): data is GlobalResponse =>
	data !== null &&
	typeof data === "object" &&
	"code" in data &&
	"message" in data;

/** Collapse any axios failure into a single `ApiError` — server envelope, offline, or unknown. */
export const normalizeAxiosError = (error: AxiosError<unknown>): ApiError => {
	const data = error.response?.data;

	if (isEnvelope(data)) {
		return new ApiError({
			status: error.response!.status,
			code: data.code,
			message: data.message,
			errors: data.errors,
			redirectUrl: data.redirectUrl,
		});
	}

	const offline = error.code === AxiosError.ERR_NETWORK;

	return new ApiError({
		status: error.response?.status ?? 0,
		code: offline ? CLIENT_ERROR.NETWORK_ERROR : CLIENT_ERROR.UNKNOWN_ERROR,
		message: offline
			? "Can't reach the server. Check your connection and try again."
			: (error.message ?? "Something went wrong. Please try again."),
	});
};

/**
 * A `createServerFn` boundary crossing only round-trips `notFound()`/`redirect()`
 * values intact — a thrown `Error` subclass loses every custom field but
 * `.message` (TanStack Start's RPC serializer special-cases just those two).
 * So a single-entity lookup's 404 has to convert to `notFound()` here, while
 * the `ApiError` is still the real thing, server-side, before it crosses.
 */
export const rejectNotFound = (error: unknown): never => {
	if (isApiError(error) && error.status === 404) {
		throw notFound();
	}
	throw error;
};

const isServer = typeof window === "undefined";

const api = axios.create({
	baseURL: isServer ? env.SERVER_API_URL : env.VITE_API_URL,
	withCredentials: !isServer,
	headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
	(response) => response,
	(error: AxiosError<unknown>) => Promise.reject(normalizeAxiosError(error)),
);

export { api };
