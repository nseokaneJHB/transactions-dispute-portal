export const APP_NAME = "Transactions Dispute Portal" as const;

export const DEFAULT_PAGE_LIMIT = 10 as const;
export const DEFAULT_PAGE_NUMBER = 1 as const;
export const MAX_PAGE_LIMIT = 100 as const;

export const ORDER_DIRECTION = { asc: "asc", desc: "desc" } as const;

export const OTP = {
	LENGTH: 6,
	EXPIRY_MINUTES: 10,
	MAX_ATTEMPTS: 5,
} as const;

export const USER_ROLE = {
	ADMIN: "ADMIN",
	CUSTOMER: "CUSTOMER",
} as const;

export const DISPUTE_STATUS = {
	SUBMITTED: "SUBMITTED",
	UNDER_REVIEW: "UNDER_REVIEW",
	RESOLVED: "RESOLVED",
	REJECTED: "REJECTED",
} as const;

export const DISPUTE_REASON = {
	FRAUDULENT_CHARGE: "FRAUDULENT_CHARGE",
	DUPLICATE_CHARGE: "DUPLICATE_CHARGE",
	INCORRECT_AMOUNT: "INCORRECT_AMOUNT",
	GOODS_NOT_RECEIVED: "GOODS_NOT_RECEIVED",
	SUBSCRIPTION_NOT_CANCELLED: "SUBSCRIPTION_NOT_CANCELLED",
	OTHER: "OTHER",
} as const;

export const OPEN_DISPUTE_STATUS = [
	DISPUTE_STATUS.SUBMITTED,
	DISPUTE_STATUS.UNDER_REVIEW,
] as const;

export const AUTH_EVENT = {
	OTP_REQUESTED: "OTP_REQUESTED",
	LOGIN_SUCCESS: "LOGIN_SUCCESS",
	LOGIN_FAILURE: "LOGIN_FAILURE",
	OTP_LOCKED: "OTP_LOCKED",
} as const;

export const SERVER_STATUS = {
	HEALTHY: "HEALTHY",
	UNHEALTHY: "UNHEALTHY",
} as const;

/**
 * Frontend paths the API can instruct the client to redirect to. Relative to
 * the web app's origin; kept here so handlers never hardcode the strings.
 */
export const FRONTEND_URLS = {
	HOME: "/",
	SIGN_IN: "/sign-in",
	DISPUTES: "/disputes",
	TRANSACTIONS: "/transactions",
	ADMIN: "/admin",
} as const;

export type FrontendRedirectUrlPaths = typeof FRONTEND_URLS;

/**
 * Standard HTTP response code constants.
 * Semantic identifiers for different HTTP response scenarios.
 */
export const HTTP_CODE = {
	OK: "OK",
	CREATED: "CREATED",
	CONFLICT: "CONFLICT",
	REDIRECT: "REDIRECT",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	NO_CONTENT: "NO_CONTENT",
	BAD_REQUEST: "BAD_REQUEST",
	NOT_ALLOWED: "NOT_ALLOWED",
	NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
	UNAUTHENTICATED: "UNAUTHENTICATED",
	VALIDATION_ERROR: "VALIDATION_ERROR",
	TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
	SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
	INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

type HTTPCode = keyof typeof HTTP_CODE;

/**
 * Maps semantic response codes (above) to their HTTP status numbers, so a
 * handler can return `HTTP_RESPONSE_CODE.NOT_FOUND` and get both the
 * status and the code that belongs in the response body's `code` field.
 */
export const HTTP_RESPONSE_CODE: Record<
	HTTPCode,
	{ status: number; code: (typeof HTTP_CODE)[HTTPCode] }
> = {
	OK: { status: 200, code: HTTP_CODE.OK },
	CREATED: { status: 201, code: HTTP_CODE.CREATED },
	NO_CONTENT: { status: 204, code: HTTP_CODE.NO_CONTENT },
	REDIRECT: { status: 302, code: HTTP_CODE.NO_CONTENT },
	FORBIDDEN: { status: 403, code: HTTP_CODE.FORBIDDEN },
	UNAUTHENTICATED: { status: 401, code: HTTP_CODE.UNAUTHENTICATED },
	TOO_MANY_REQUESTS: { status: 429, code: HTTP_CODE.TOO_MANY_REQUESTS },
	BAD_REQUEST: { status: 400, code: HTTP_CODE.BAD_REQUEST },
	VALIDATION_ERROR: { status: 422, code: HTTP_CODE.VALIDATION_ERROR },
	NOT_FOUND: { status: 404, code: HTTP_CODE.NOT_FOUND },
	NOT_ALLOWED: { status: 405, code: HTTP_CODE.NOT_ALLOWED },
	CONFLICT: { status: 409, code: HTTP_CODE.CONFLICT },
	NOT_IMPLEMENTED: { status: 501, code: HTTP_CODE.NOT_IMPLEMENTED },
	SERVICE_UNAVAILABLE: { status: 503, code: HTTP_CODE.SERVICE_UNAVAILABLE },
	INTERNAL_SERVER_ERROR: { status: 500, code: HTTP_CODE.INTERNAL_SERVER_ERROR },
} as const;

/**
 * Logical API namespaces — the top-level route groupings mounted in the
 * backend. `API_URLS` resolves each to its concrete (version-prefixed) base.
 */
export const API_NAMESPACE = {
	AUTH: "AUTH",
	ADMIN: "ADMIN",
	HEALTH: "HEALTH",
	CUSTOMER: "CUSTOMER",
} as const;

export type ApiNamespace = keyof typeof API_NAMESPACE;

/**
 * Resolve each API namespace to its concrete base path for a given version.
 * Health checks stay unversioned (`docs/decisions.md` #18) — infra probes are
 * not API consumers — so `HEALTH` resolves to an empty prefix. `CUSTOMER` is
 * the customer-facing product surface mounted at the bare version root, as
 * opposed to the invite-only `ADMIN` back-office; every route under it still
 * requires a customer session.
 *
 * @example
 * const urls = API_URLS("v1");
 * urls.CUSTOMER; // "/v1"
 * urls.ADMIN;    // "/v1/admin"
 */
export const API_URLS = <V extends string>(
	version: V,
): Record<ApiNamespace, string> => ({
	HEALTH: "",
	AUTH: `/${version}/auth`,
	CUSTOMER: `/${version}`,
	ADMIN: `/${version}/admin`,
});

/**
 * Route paths within each module, relative to the namespace prefix its plugin
 * is registered under. Centralized here so client and server never drift on a
 * literal string.
 */
export const API_PATHS = {
	HEALTHZ: "/healthz",
	READYZ: "/readyz",

	AUTH_OTP_REQUEST: "/otp",
	AUTH_OTP_VERIFY: "/otp/verify",
	AUTH_SIGN_OUT: "/sign-out",

	TRANSACTIONS: "/transactions",
	TRANSACTION_DETAIL: "/transactions/:transactionId",

	DISPUTES: "/disputes",
	DISPUTE_DETAIL: "/disputes/:disputeId",

	ADMIN_DISPUTES: "/disputes",
	ADMIN_DISPUTE_RESOLVE: "/disputes/:disputeId/resolve",
	ADMIN_INVITES: "/invites",
	ADMIN_INVITE_ACCEPT: "/invites/:token/accept",
} as const;
