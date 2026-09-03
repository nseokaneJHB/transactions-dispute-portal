import { v7 as uuidv7 } from "uuid";

/**
 * Generate a unique identifier using UUID v7.
 *
 * @returns A time-ordered UUID v7 string.
 */
export const generateUuid = (): string => uuidv7();

/**
 * Reject if `promise` has not settled within `ms` milliseconds.
 *
 * @param promise - The work to bound.
 * @param ms - The deadline in milliseconds.
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(`Timed out after ${ms}ms.`)), ms).unref();
		}),
	]);
