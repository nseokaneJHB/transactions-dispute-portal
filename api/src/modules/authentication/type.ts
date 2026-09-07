import type { RouteGenericInterface } from "fastify";

import type {
	GlobalResponse,
	AuthSessionResponse,
	AuthOtpRequestBody,
	AuthOtpVerifyBody,
	AuthChangeEmailBody,
	AuthChangeEmailConfirmBody,
} from "@transaction-dispute-portal/shared";

export interface GetSessionRequest extends RouteGenericInterface {
	Reply: AuthSessionResponse | GlobalResponse;
}

export interface RequestOtpRequest extends RouteGenericInterface {
	Body: AuthOtpRequestBody;
	Reply: GlobalResponse;
}

export interface VerifyOtpRequest extends RouteGenericInterface {
	Body: AuthOtpVerifyBody;
	Reply: GlobalResponse;
}

export interface ChangeEmailRequest extends RouteGenericInterface {
	Body: AuthChangeEmailBody;
	Reply: GlobalResponse;
}

export interface ConfirmEmailChangeRequest extends RouteGenericInterface {
	Body: AuthChangeEmailConfirmBody;
	Reply: GlobalResponse;
}

export interface SignOutRequest extends RouteGenericInterface {
	Reply: GlobalResponse;
}
