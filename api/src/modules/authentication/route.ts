import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	API_PATHS,
	globalResponseSchema,
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
} from "@transaction-dispute-portal/shared";

import { requestOtp, verifyOtp, endSession } from "./service.js";

const OTP_REQUEST_RATE_LIMIT = { max: 5, timeWindow: 60_000 };
const OTP_VERIFY_RATE_LIMIT = { max: 10, timeWindow: 60_000 };

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
