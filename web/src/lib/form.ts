import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ApiError } from "@/api";

/**
 * Push a `422`'s per-field errors from the API envelope onto the matching
 * `react-hook-form` fields, so server-side validation surfaces inline exactly
 * like client-side validation.
 */
export const applyServerErrors = <T extends FieldValues>(
	setError: UseFormSetError<T>,
	error: ApiError,
): void => {
	error.errors?.forEach((issue) =>
		setError(issue.field as Path<T>, { message: issue.message }),
	);
};
