import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import { ApiError, isApiError, normalizeAxiosError } from "@/api";

const axiosErrorWith = (
	response: Partial<AxiosError["response"]>,
	code?: string,
): AxiosError<unknown> => {
	const error = new AxiosError("Request failed");
	error.code = code;
	error.response = response as AxiosError["response"];
	return error;
};

describe("normalizeAxiosError", () => {
	it("maps a server envelope, keeping code, status and field errors", () => {
		const result = normalizeAxiosError(
			axiosErrorWith({
				status: 422,
				data: {
					code: "VALIDATION_ERROR",
					message: "Validation error.",
					errors: [{ field: "email", message: "Invalid email address" }],
				},
			}),
		);

		expect(result).toBeInstanceOf(ApiError);
		expect(result.status).toBe(422);
		expect(result.code).toBe("VALIDATION_ERROR");
		expect(result.errors?.[0]?.field).toBe("email");
	});

	it("carries a redirectUrl from a 401 envelope", () => {
		const result = normalizeAxiosError(
			axiosErrorWith({
				status: 401,
				data: {
					code: "UNAUTHENTICATED",
					message: "Unauthenticated.",
					redirectUrl: "/sign-in",
				},
			}),
		);

		expect(result.redirectUrl).toBe("/sign-in");
	});

	it("falls back to a friendly network error when offline", () => {
		const result = normalizeAxiosError(
			axiosErrorWith({}, AxiosError.ERR_NETWORK),
		);

		expect(result.code).toBe("NETWORK_ERROR");
		expect(result.status).toBe(0);
	});
});

describe("isApiError", () => {
	it("recognises an ApiError instance", () => {
		expect(
			isApiError(new ApiError({ status: 500, code: "X", message: "y" })),
		).toBe(true);
		expect(isApiError(new Error("plain"))).toBe(false);
	});
});
