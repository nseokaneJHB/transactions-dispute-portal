import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
