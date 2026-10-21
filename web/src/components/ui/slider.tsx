import type { ComponentProps } from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export const Slider = ({
	className,
	value,
	defaultValue,
	...props
}: ComponentProps<typeof SliderPrimitive.Root>) => {
	const thumbs = (value ?? defaultValue ?? [0]).length;

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			value={value}
			defaultValue={defaultValue}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full">
				<SliderPrimitive.Range className="bg-primary absolute h-full" />
			</SliderPrimitive.Track>
			{Array.from({ length: thumbs }, (_, index) => (
				<SliderPrimitive.Thumb
					key={index}
					className="border-primary bg-card focus-visible:ring-ring block size-4 rounded-full border-2 shadow-sm outline-none focus-visible:ring-2"
				/>
			))}
		</SliderPrimitive.Root>
	);
};
