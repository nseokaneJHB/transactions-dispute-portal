import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Table = ({ className, ...props }: ComponentProps<"table">) => (
	<div className="w-full overflow-x-auto rounded-xl border">
		<table className={cn("w-full text-sm", className)} {...props} />
	</div>
);

export const TableHead = (props: ComponentProps<"thead">) => (
	<thead className="bg-muted/60 text-muted-foreground text-left" {...props} />
);

export const TableBody = (props: ComponentProps<"tbody">) => (
	<tbody className="divide-y" {...props} />
);

export const TableRow = ({ className, ...props }: ComponentProps<"tr">) => (
	<tr
		className={cn("hover:bg-muted/40 transition-colors", className)}
		{...props}
	/>
);

export const TableHeaderCell = ({
	className,
	...props
}: ComponentProps<"th">) => (
	<th
		className={cn("px-4 py-2.5 font-medium whitespace-nowrap", className)}
		{...props}
	/>
);

export const TableCell = ({ className, ...props }: ComponentProps<"td">) => (
	<td className={cn("px-4 py-3 align-middle", className)} {...props} />
);
