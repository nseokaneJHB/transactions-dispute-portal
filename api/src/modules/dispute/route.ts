import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	USER_ROLE,
	API_PATHS,
	uuidParamsSchema,
	globalResponseSchema,
	disputesQuerySchema,
	disputeResponseSchema,
	disputeCreateBodySchema,
	disputeListResponseSchema,
} from "@transaction-dispute-portal/shared";

import { getDispute, listDisputes, submitDispute } from "./service.js";

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "POST",
		url: API_PATHS.DISPUTES,
		handler: submitDispute,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.CUSTOMER)],
		schema: {
			body: disputeCreateBodySchema,
			response: {
				201: disputeResponseSchema,
				401: globalResponseSchema,
				403: globalResponseSchema,
				404: globalResponseSchema,
				409: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "GET",
		url: API_PATHS.DISPUTES,
		handler: listDisputes,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.CUSTOMER)],
		schema: {
			querystring: disputesQuerySchema,
			response: {
				200: disputeListResponseSchema,
				401: globalResponseSchema,
				403: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "GET",
		url: API_PATHS.DISPUTE_DETAIL,
		handler: getDispute,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.CUSTOMER)],
		schema: {
			params: uuidParamsSchema("disputeId"),
			response: {
				200: disputeResponseSchema,
				401: globalResponseSchema,
				403: globalResponseSchema,
				404: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});
};
