export const APP_NAME = "Transactions Dispute Portal" as const;

export const DEFAULT_PAGE_LIMIT = 10 as const;
export const DEFAULT_PAGE_NUMBER = 1 as const;

export const ORDER_DIRECTION = { asc: "asc", desc: "desc" } as const;

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

/**
 * Standard HTTP response code constants.
 * Semantic identifiers for different HTTP response scenarios.
 */
export const HTTP_CODE = {
	OK: "OK",
	CREATED: "CREATED",
	CONFLICT: "CONFLICT",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	NO_CONTENT: "NO_CONTENT",
	BAD_REQUEST: "BAD_REQUEST",
	NOT_ALLOWED: "NOT_ALLOWED",
	UNAUTHENTICATED: "UNAUTHENTICATED",
	VALIDATION_ERROR: "VALIDATION_ERROR",
	TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
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
	FORBIDDEN: { status: 403, code: HTTP_CODE.FORBIDDEN },
	UNAUTHENTICATED: { status: 401, code: HTTP_CODE.UNAUTHENTICATED },
	TOO_MANY_REQUESTS: { status: 429, code: HTTP_CODE.TOO_MANY_REQUESTS },
	BAD_REQUEST: { status: 400, code: HTTP_CODE.BAD_REQUEST },
	VALIDATION_ERROR: { status: 422, code: HTTP_CODE.VALIDATION_ERROR },
	NOT_FOUND: { status: 404, code: HTTP_CODE.NOT_FOUND },
	NOT_ALLOWED: { status: 405, code: HTTP_CODE.NOT_ALLOWED },
	CONFLICT: { status: 409, code: HTTP_CODE.CONFLICT },
	INTERNAL_SERVER_ERROR: { status: 500, code: HTTP_CODE.INTERNAL_SERVER_ERROR },
} as const;
