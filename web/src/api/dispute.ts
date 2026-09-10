import { createServerFn } from "@tanstack/react-start";

import {
	API_URLS,
	API_PATHS,
	buildUrlWithParams,
	type DisputeStatus,
	type DisputeResponse,
	type DisputeCreateBody,
	type DisputeListResponse,
} from "@transaction-dispute-portal/shared";

import { api, rejectNotFound } from "@/api";
import { forwardCookie } from "@/api/server";

import { env } from "@/lib/env";

const customerUrl = API_URLS(env.VITE_API_VERSION).CUSTOMER;

export interface DisputesQueryInput {
	status?: DisputeStatus;
	transaction_id?: string;
	order?: "asc" | "desc";
	page?: number;
	limit?: number;
}

export const disputesRequest = createServerFn({ method: "GET" })
	.inputValidator((input: DisputesQueryInput) => input)
	.handler(async ({ data: params }): Promise<DisputeListResponse> => {
		const { data } = await api.get<DisputeListResponse>(
			`${customerUrl}${API_PATHS.DISPUTES}`,
			forwardCookie({ params }),
		);
		return data;
	});

export const disputeRequest = createServerFn({ method: "GET" })
	.inputValidator((disputeId: string) => disputeId)
	.handler(async ({ data: disputeId }): Promise<DisputeResponse> => {
		try {
			const { data } = await api.get<DisputeResponse>(
				buildUrlWithParams(`${customerUrl}${API_PATHS.DISPUTE_DETAIL}`, {
					disputeId,
				}),
				forwardCookie(),
			);
			return data;
		} catch (error) {
			return rejectNotFound(error);
		}
	});

export const submitDispute = async (
	payload: DisputeCreateBody,
): Promise<DisputeResponse> => {
	const { data } = await api.post<DisputeResponse>(
		`${customerUrl}${API_PATHS.DISPUTES}`,
		payload,
	);
	return data;
};

export const withdrawDispute = async (
	disputeId: string,
): Promise<DisputeResponse> => {
	const { data } = await api.post<DisputeResponse>(
		buildUrlWithParams(`${customerUrl}${API_PATHS.DISPUTE_WITHDRAW}`, {
			disputeId,
		}),
		null,
	);
	return data;
};
