import type { RouteGenericInterface } from "fastify";

import type {
	UuidParams,
	GlobalResponse,
	DisputesQuery,
	DisputeResponse,
	DisputeCreateBody,
	DisputeListResponse,
} from "@transaction-dispute-portal/shared";

export interface SubmitDisputeRequest extends RouteGenericInterface {
	Body: DisputeCreateBody;
	Reply: DisputeResponse | GlobalResponse;
}

export interface ListDisputesRequest extends RouteGenericInterface {
	Querystring: DisputesQuery;
	Reply: DisputeListResponse | GlobalResponse;
}

export interface GetDisputeRequest extends RouteGenericInterface {
	Params: UuidParams<"disputeId">;
	Reply: DisputeResponse | GlobalResponse;
}
