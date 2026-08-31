import type { RouteGenericInterface } from "fastify";

import type {
	UuidParams,
	GlobalResponse,
	DisputesQuery,
	DisputeResolveBody,
	AdminDisputeResponse,
	AdminDisputeListResponse,
} from "@transaction-dispute-portal/shared";

export interface ListDisputesForReviewRequest extends RouteGenericInterface {
	Querystring: DisputesQuery;
	Reply: AdminDisputeListResponse | GlobalResponse;
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
