import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
	<input
		data-slot="input"
		className={cn(
			"border-input bg-card h-10 w-full min-w-0 rounded-md border px-3 text-sm shadow-xs transition-colors outline-none",
			"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
			"aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...props}
	/>
);
