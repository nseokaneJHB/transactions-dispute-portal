import { OPEN_DISPUTE_STATUS, TERMINAL_DISPUTE_STATUS } from "./constant.js";

/**
 * Extract the literal names of every `:param` segment in a route pattern as a
 * union of string-literal types.
 *
 * @example
 * ExtractParams<"/disputes/:disputeId/withdraw">; // "disputeId"
 */
type ExtractParams<T extends string> =
	T extends `${string}:${infer Param}/${infer Rest}`
		? Param | ExtractParams<`/${Rest}`>
		: T extends `${string}:${infer Param}`
			? Param
			: never;

/**
 * Build a concrete URL from a Fastify-style route pattern by substituting each
 * `:param` segment with its value. The required keys of `params` are inferred
 * from the pattern at compile time, so a missing or misspelled key is a type
 * error. Kept in `shared` so the client and server never drift on a path.
 *
 * @example
 * buildUrlWithParams(API_PATHS.DISPUTE_WITHDRAW, { disputeId });
 * // "/disputes/:disputeId/withdraw" -> "/disputes/abc-123/withdraw"
 */
export const buildUrlWithParams = <T extends string>(
	pattern: T,
	params: Record<ExtractParams<T>, string>,
): string => {
	let url: string = pattern;

	for (const [key, value] of Object.entries(params)) {
		url = url.replace(`:${key}`, value as string);
	}

	return url;
};

/**
 * Whether a dispute status is one a customer or admin can still act on
 * (`SUBMITTED` / `UNDER_REVIEW`). The single source of the open/closed
 * partition — route handlers must not re-derive it inline.
 */
export const isOpenDisputeStatus = (status: string): boolean =>
	(OPEN_DISPUTE_STATUS as readonly string[]).includes(status);

/**
 * Whether a dispute status is terminal (`RESOLVED` / `REJECTED` / `WITHDRAWN`)
 * — the complement of {@link isOpenDisputeStatus}.
 */
export const isTerminalDisputeStatus = (status: string): boolean =>
	(TERMINAL_DISPUTE_STATUS as readonly string[]).includes(status);

/**
 * Convert a string to Title Case, treating underscores, hyphens, and
 * whitespace as word boundaries and collapsing them into single spaces.
 *
 * @example
 * stringToTitleCase("under_review"); // "Under Review"
 * stringToTitleCase(undefined);      // ""
 *
 * @param value - The string to convert. Falsy values return an empty string.
 * @returns The title-cased string, or `""` if no input was provided.
 */
export const stringToTitleCase = (value?: string): string => {
	if (!value) return "";

	return value
		.toLowerCase()
		.replace(/(^|[_\s-])\S/g, (match) => match.toUpperCase())
		.replace(/[_\s-]+/g, " ");
};
