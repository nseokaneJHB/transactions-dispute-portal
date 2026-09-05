import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	OTP,
	API_PATHS,
	globalResponseSchema,
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
	authChangeEmailBodySchema,
	authChangeEmailConfirmBodySchema,
} from "@transaction-dispute-portal/shared";

import {
	requestOtp,
	verifyOtp,
	endSession,
	changeEmail,
	confirmEmailChange,
} from "./service.js";

const OTP_REQUEST_RATE_LIMIT = { max: OTP.MAX_ATTEMPTS };
const OTP_VERIFY_RATE_LIMIT = { max: OTP.MAX_ATTEMPTS * 2 };
const EMAIL_CHANGE_RATE_LIMIT = { max: OTP.MAX_ATTEMPTS };

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "POST",
		url: API_PATHS.AUTH_OTP_REQUEST,
		handler: requestOtp,
		config: { rateLimit: OTP_REQUEST_RATE_LIMIT },
		schema: {
			body: authOtpRequestBodySchema,
			response: {
				200: globalResponseSchema,
				400: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.AUTH_OTP_VERIFY,
		handler: verifyOtp,
		config: { rateLimit: OTP_VERIFY_RATE_LIMIT },
		schema: {
			body: authOtpVerifyBodySchema,
			response: {
				200: globalResponseSchema,
				401: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.AUTH_CHANGE_EMAIL,
		handler: changeEmail,
		preHandler: [app.authenticate],
		config: { rateLimit: EMAIL_CHANGE_RATE_LIMIT },
		schema: {
			body: authChangeEmailBodySchema,
			response: {
				200: globalResponseSchema,
				401: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.AUTH_CHANGE_EMAIL_CONFIRM,
		handler: confirmEmailChange,
		config: { rateLimit: EMAIL_CHANGE_RATE_LIMIT },
		schema: {
			body: authChangeEmailConfirmBodySchema,
			response: {
				200: globalResponseSchema,
				401: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.AUTH_SIGN_OUT,
		handler: endSession,
		schema: {
			response: {
				200: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});
};
