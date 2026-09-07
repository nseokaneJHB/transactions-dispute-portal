import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Badge = ({ className, ...props }: ComponentProps<"span">) => (
	<span
		data-slot="badge"
		className={cn(
			"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
			className,
		)}
		{...props}
	/>
);
