import type { RouteGenericInterface } from "fastify";

import type {
	GlobalResponse,
	AdminInviteCreateBody,
	AdminInviteAcceptBody,
	AdminInviteTokenParams,
	AdminInviteResponse,
} from "@transaction-dispute-portal/shared";

export interface SendInviteRequest extends RouteGenericInterface {
	Body: AdminInviteCreateBody;
	Reply: AdminInviteResponse | GlobalResponse;
}

export interface AcceptInviteRequest extends RouteGenericInterface {
	Params: AdminInviteTokenParams;
	Body: AdminInviteAcceptBody;
	Reply: GlobalResponse;
}
