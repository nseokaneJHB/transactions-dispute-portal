import { toast } from "sonner";

import type { GlobalResponse } from "@transaction-dispute-portal/shared";

import { isApiError, type ApiError } from "@/api";

interface ToastMutationPayload<T extends GlobalResponse> {
	loading: string;
	promise: Promise<T>;
	onSuccess?: (data: T) => void | Promise<void>;
	onError?: (error: ApiError) => void | Promise<void>;
}

/**
 * Drive a mutation promise through a sonner toast — spinner while pending, the
 * server's `message` on either outcome — and run the caller's follow-up.
 */
export const useToastMutation = <T extends GlobalResponse>({
	promise,
	loading,
	onSuccess,
	onError,
}: ToastMutationPayload<T>): void => {
	toast.dismiss();

	toast.promise(promise, {
		loading,
		success: (data) => {
			void Promise.resolve(onSuccess?.(data)).catch(console.error);
			return data.message;
		},
		error: (error: unknown) => {
			if (isApiError(error)) {
				void Promise.resolve(onError?.(error)).catch(console.error);
				return error.message;
			}
			return "Something went wrong. Please try again.";
		},
	});
};
