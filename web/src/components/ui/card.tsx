import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		data-slot="card"
		className={cn(
			"bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-5 shadow-sm",
			className,
		)}
		{...props}
	/>
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-1", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: ComponentProps<"h2">) => (
	<h2 className={cn("text-base font-semibold", className)} {...props} />
);

export const CardDescription = ({
	className,
	...props
}: ComponentProps<"p">) => (
	<p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-3", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex items-center gap-2", className)} {...props} />
);
