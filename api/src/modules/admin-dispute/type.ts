import type { RouteGenericInterface } from "fastify";

import type {
	UuidParams,
	GlobalResponse,
	AdminDisputesQuery,
	DisputeResolveBody,
	AdminDisputeResponse,
	AdminDisputeListResponse,
	AdminDisputeSummaryResponse,
} from "@transaction-dispute-portal/shared";

export interface ListDisputesForReviewRequest extends RouteGenericInterface {
	Querystring: AdminDisputesQuery;
	Reply: AdminDisputeListResponse | GlobalResponse;
}

export interface GetDisputeSummaryRequest extends RouteGenericInterface {
	Reply: AdminDisputeSummaryResponse | GlobalResponse;
}

export interface StartDisputeReviewRequest extends RouteGenericInterface {
	Params: UuidParams<"disputeId">;
	Reply: AdminDisputeResponse | GlobalResponse;
}

export interface ResolveDisputeRequest extends RouteGenericInterface {
	Params: UuidParams<"disputeId">;
	Body: DisputeResolveBody;
	Reply: AdminDisputeResponse | GlobalResponse;
}
