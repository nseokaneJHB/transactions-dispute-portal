import type { ComponentProps } from "react";

import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogContent = ({
	className,
	children,
	...props
}: ComponentProps<typeof DialogPrimitive.Content>) => (
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
		<DialogPrimitive.Content
			className={cn(
				"bg-card fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
				className,
			)}
			{...props}
		>
			{children}
			<DialogPrimitive.Close className="text-muted-foreground hover:bg-muted absolute top-4 right-4 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
				<XIcon className="size-4" />
				<span className="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
);

export const DialogHeader = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-1 pr-6", className)} {...props} />
);

export const DialogTitle = ({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
	<DialogPrimitive.Title
		className={cn("text-base font-semibold", className)}
		{...props}
	/>
);

export const DialogDescription = ({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
	<DialogPrimitive.Description
		className={cn("text-muted-foreground text-sm", className)}
		{...props}
	/>
);
