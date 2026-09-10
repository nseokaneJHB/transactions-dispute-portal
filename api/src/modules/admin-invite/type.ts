import type { RouteGenericInterface } from "fastify";

import type {
	GlobalResponse,
	AdminInviteCreateBody,
	AdminInviteAcceptBody,
	AdminInviteTokenParams,
	AdminInvitesQuery,
	AdminInviteResponse,
	AdminInviteListResponse,
} from "@transaction-dispute-portal/shared";

export interface ListInvitesRequest extends RouteGenericInterface {
	Querystring: AdminInvitesQuery;
	Reply: AdminInviteListResponse | GlobalResponse;
}

export interface SendInviteRequest extends RouteGenericInterface {
	Body: AdminInviteCreateBody;
	Reply: AdminInviteResponse | GlobalResponse;
}

export interface AcceptInviteRequest extends RouteGenericInterface {
	Params: AdminInviteTokenParams;
	Body: AdminInviteAcceptBody;
	Reply: GlobalResponse;
}
