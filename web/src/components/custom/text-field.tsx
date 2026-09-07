import type { ComponentProps } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

interface Common {
	label?: string;
	error?: string;
	hint?: string;
}

export const TextField = ({
	label,
	error,
	hint,
	id,
	...props
}: Common & ComponentProps<"input">) => (
	<Field label={label} error={error} hint={hint} htmlFor={id}>
		<Input id={id} aria-invalid={Boolean(error)} {...props} />
	</Field>
);

export const TextAreaField = ({
	label,
	error,
	hint,
	id,
	...props
}: Common & ComponentProps<"textarea">) => (
	<Field label={label} error={error} hint={hint} htmlFor={id}>
		<Textarea id={id} aria-invalid={Boolean(error)} {...props} />
	</Field>
);

export const SelectField = ({
	label,
	error,
	hint,
	id,
	children,
	...props
}: Common & ComponentProps<"select">) => (
	<Field label={label} error={error} hint={hint} htmlFor={id}>
		<Select id={id} {...props}>
			{children}
		</Select>
	</Field>
);
