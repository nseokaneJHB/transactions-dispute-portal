import { createServerFn } from "@tanstack/react-start";

import {
	API_URLS,
	API_PATHS,
	buildUrlWithParams,
	type AdminDisputesQuery,
	type AdminInvitesQuery,
	type AdminInviteResponse,
	type AdminInviteCreateBody,
	type AdminInviteListResponse,
	type DisputeResolveBody,
	type AdminDisputeResponse,
	type AdminDisputeListResponse,
	type AdminDisputeSummaryResponse,
} from "@transaction-dispute-portal/shared";

import { api } from "@/api";
import { forwardCookie } from "@/api/server";

import { env } from "@/lib/env";

const adminUrl = API_URLS(env.VITE_API_VERSION).ADMIN;

export const adminDisputesRequest = createServerFn({ method: "GET" })
	.inputValidator((input: Partial<AdminDisputesQuery>) => input)
	.handler(async ({ data: params }): Promise<AdminDisputeListResponse> => {
		const { data } = await api.get<AdminDisputeListResponse>(
			`${adminUrl}${API_PATHS.ADMIN_DISPUTES}`,
			forwardCookie({ params }),
		);
		return data;
	});

export const adminDisputeSummaryRequest = createServerFn({ method: "GET" }).handler(
	async (): Promise<AdminDisputeSummaryResponse> => {
		const { data } = await api.get<AdminDisputeSummaryResponse>(
			`${adminUrl}${API_PATHS.ADMIN_DISPUTE_SUMMARY}`,
			forwardCookie(),
		);
		return data;
	},
);

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

type ResolveDisputePayload = DisputeResolveBody & { disputeId: string };

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

export const adminInvitesRequest = createServerFn({ method: "GET" })
	.inputValidator((input: Partial<AdminInvitesQuery>) => input)
	.handler(async ({ data: params }): Promise<AdminInviteListResponse> => {
		const { data } = await api.get<AdminInviteListResponse>(
			`${adminUrl}${API_PATHS.ADMIN_INVITES}`,
			forwardCookie({ params }),
		);
		return data;
	});

export const sendAdminInvite = async (
	payload: AdminInviteCreateBody,
): Promise<AdminInviteResponse> => {
	const { data } = await api.post<AdminInviteResponse>(
		`${adminUrl}${API_PATHS.ADMIN_INVITES}`,
		payload,
	);
	return data;
};
