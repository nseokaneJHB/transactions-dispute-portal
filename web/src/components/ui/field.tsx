import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FieldProps {
	label?: string;
	error?: string;
	hint?: string;
	htmlFor?: string;
	className?: string;
	children: ReactNode;
}

/** Label + control + hint/error, the shape every form row shares. */
export const Field = ({
	label,
	error,
	hint,
	htmlFor,
	className,
	children,
}: FieldProps) => (
	<div className={cn("flex flex-col gap-1.5", className)}>
		{label && (
			<label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</label>
		)}
		{children}
		{error ? (
			<p className="text-destructive text-xs">{error}</p>
		) : hint ? (
			<p className="text-muted-foreground text-xs">{hint}</p>
		) : null}
	</div>
);

export const Label = ({ className, ...props }: ComponentProps<"label">) => (
	<label className={cn("text-sm font-medium", className)} {...props} />
);
