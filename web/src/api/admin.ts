import { createServerFn } from "@tanstack/react-start";

import {
	API_URLS,
	API_PATHS,
	buildUrlWithParams,
	type DisputeStatus,
	type AdminInviteResponse,
	type AdminInviteCreateBody,
	type DisputeResolveBody,
	type AdminDisputeResponse,
	type AdminDisputeListResponse,
} from "@transaction-dispute-portal/shared";

import { api } from "@/api";
import { forwardCookie } from "@/api/server";

import { env } from "@/lib/env";

const adminUrl = API_URLS(env.VITE_API_VERSION).ADMIN;

export interface AdminDisputesQueryInput {
	status?: DisputeStatus;
	order?: "asc" | "desc";
	page?: number;
	limit?: number;
}

export const adminDisputesRequest = createServerFn({ method: "GET" })
	.inputValidator((input: AdminDisputesQueryInput) => input)
	.handler(async ({ data: params }): Promise<AdminDisputeListResponse> => {
		const { data } = await api.get<AdminDisputeListResponse>(
			`${adminUrl}${API_PATHS.ADMIN_DISPUTES}`,
			forwardCookie({ params }),
		);
		return data;
	});

export const reviewDispute = async (
	disputeId: string,
): Promise<AdminDisputeResponse> => {
	const { data } = await api.post<AdminDisputeResponse>(
		buildUrlWithParams(`${adminUrl}${API_PATHS.ADMIN_DISPUTE_REVIEW}`, {
			disputeId,
		}),
		null,
	);
	return data;
};

export type ResolveDisputePayload = DisputeResolveBody & { disputeId: string };

export const resolveDispute = async ({
	disputeId,
	...payload
}: ResolveDisputePayload): Promise<AdminDisputeResponse> => {
	const { data } = await api.post<AdminDisputeResponse>(
		buildUrlWithParams(`${adminUrl}${API_PATHS.ADMIN_DISPUTE_RESOLVE}`, {
			disputeId,
		}),
		payload,
	);
	return data;
};

export const sendAdminInvite = async (
	payload: AdminInviteCreateBody,
): Promise<AdminInviteResponse> => {
	const { data } = await api.post<AdminInviteResponse>(
		`${adminUrl}${API_PATHS.ADMIN_INVITES}`,
		payload,
	);
	return data;
};
