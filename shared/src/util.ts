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
