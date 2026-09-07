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
	type?: "string" | "select";
}

type DomChangeHandler = (
	event: ChangeEvent<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>,
) => void;

interface FieldResult<TValue, TOnChange> {
	value: TValue;
	onChange: TOnChange;
	loading: boolean;
	error: string | undefined;
}

export function useFormField<TFieldValues extends FieldValues>(
	props: UseFormFieldProps<TFieldValues> & { type: "select" },
): FieldResult<string, (value: string) => void>;

export function useFormField<TFieldValues extends FieldValues>(
	props: UseFormFieldProps<TFieldValues> & { type?: "string" },
): FieldResult<string, DomChangeHandler>;

export function useFormField<TFieldValues extends FieldValues>({
	name,
	control,
	type = "string",
}: UseFormFieldProps<TFieldValues>) {
	const { field, fieldState, formState } = useController({ name, control });

	const base = {
		loading: formState.isSubmitting,
		error: fieldState.error?.message,
	};

	if (type === "select") {
		return {
			...base,
			value: (field.value as string | undefined) ?? "",
			onChange: (value: string) => field.onChange(value),
		};
	}

	return {
		...base,
		value: (field.value as string | undefined) ?? "",
		onChange: (
			event: ChangeEvent<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
			>,
		) => field.onChange(event.target.value),
	};
}
