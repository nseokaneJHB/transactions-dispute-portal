import type { ChangeEvent } from "react";

import {
	useController,
	type Path,
	type Control,
	type FieldValues,
} from "react-hook-form";

interface UseFormFieldProps<TFieldValues extends FieldValues> {
	name: Path<TFieldValues>;
	control: Control<TFieldValues>;
}

type DomChangeHandler = (
	event: ChangeEvent<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>,
) => void;

/**
 * Bridge a `react-hook-form` field to the custom `TextField` / `SelectField` /
 * `TextAreaField` components — hands back the field's `value`, a DOM `onChange`,
 * and its validation `error`.
 */
export const useFormField = <TFieldValues extends FieldValues>({
	name,
	control,
}: UseFormFieldProps<TFieldValues>): {
	value: string;
	onChange: DomChangeHandler;
	error: string | undefined;
} => {
	const { field, fieldState } = useController({ name, control });

	return {
		value: (field.value as string | undefined) ?? "",
		error: fieldState.error?.message,
		onChange: (event) => field.onChange(event.target.value),
	};
};
