import type { RouteGenericInterface } from "fastify";

import type {
	GlobalResponse,
	AuthOtpRequestBody,
	AuthOtpVerifyBody,
} from "@transaction-dispute-portal/shared";

export interface RequestOtpRequest extends RouteGenericInterface {
	Body: AuthOtpRequestBody;
	Reply: GlobalResponse;
}

export interface VerifyOtpRequest extends RouteGenericInterface {
	Body: AuthOtpVerifyBody;
	Reply: GlobalResponse;
}

export interface SignOutRequest extends RouteGenericInterface {
	Reply: GlobalResponse;
}
