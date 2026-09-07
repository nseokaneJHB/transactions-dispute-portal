import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Textarea = ({
	className,
	...props
}: ComponentProps<"textarea">) => (
	<textarea
		data-slot="textarea"
		className={cn(
			"border-input bg-card min-h-24 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors outline-none",
			"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
			"aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...props}
	/>
);
