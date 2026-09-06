import { OPEN_DISPUTE_STATUS, TERMINAL_DISPUTE_STATUS } from "./constant.js";

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
