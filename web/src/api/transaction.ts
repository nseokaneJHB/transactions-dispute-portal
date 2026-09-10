import { createServerFn } from "@tanstack/react-start";

import {
	API_URLS,
	API_PATHS,
	buildUrlWithParams,
	type TransactionResponse,
	type TransactionListResponse,
} from "@transaction-dispute-portal/shared";

import { api, rejectNotFound } from "@/api";
import { forwardCookie } from "@/api/server";

import { env } from "@/lib/env";

const customerUrl = API_URLS(env.VITE_API_VERSION).CUSTOMER;

export interface TransactionsQueryInput {
	from?: string;
	to?: string;
	order?: "asc" | "desc";
	page?: number;
	limit?: number;
}

export const transactionsRequest = createServerFn({ method: "GET" })
	.inputValidator((input: TransactionsQueryInput) => input)
	.handler(async ({ data: params }): Promise<TransactionListResponse> => {
		const { data } = await api.get<TransactionListResponse>(
			`${customerUrl}${API_PATHS.TRANSACTIONS}`,
			forwardCookie({ params }),
		);
		return data;
	});

export const transactionRequest = createServerFn({ method: "GET" })
	.inputValidator((transactionId: string) => transactionId)
	.handler(async ({ data: transactionId }): Promise<TransactionResponse> => {
		try {
			const { data } = await api.get<TransactionResponse>(
				buildUrlWithParams(`${customerUrl}${API_PATHS.TRANSACTION_DETAIL}`, {
					transactionId,
				}),
				forwardCookie(),
			);
			return data;
		} catch (error) {
			return rejectNotFound(error);
		}
	});
