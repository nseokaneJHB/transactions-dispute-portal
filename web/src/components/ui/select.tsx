import type { ComponentProps } from "react";

import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const Select = ({ className, ...props }: ComponentProps<"select">) => (
	<div className="relative">
		<select
			data-slot="select"
			className={cn(
				"border-input bg-card h-10 w-full appearance-none rounded-md border px-3 pr-9 text-sm shadow-xs transition-colors outline-none",
				"focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-2",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
		<ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
	</div>
);
