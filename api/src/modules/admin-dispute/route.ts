import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	USER_ROLE,
	API_PATHS,
	uuidParamsSchema,
	globalResponseSchema,
	disputesQuerySchema,
	disputeResolveBodySchema,
	adminDisputeResponseSchema,
	adminDisputeListResponseSchema,
} from "@transaction-dispute-portal/shared";

import {
	listDisputesForReview,
	resolveDisputeForReview,
	startDisputeReview,
} from "./service.js";

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "GET",
		url: API_PATHS.ADMIN_DISPUTES,
		handler: listDisputesForReview,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
		schema: {
			querystring: disputesQuerySchema,
			response: {
				200: adminDisputeListResponseSchema,
				401: globalResponseSchema,
				403: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.ADMIN_DISPUTE_REVIEW,
		handler: startDisputeReview,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
		schema: {
			params: uuidParamsSchema("disputeId"),
			response: {
				200: adminDisputeResponseSchema,
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
		method: "POST",
		url: API_PATHS.ADMIN_DISPUTE_RESOLVE,
		handler: resolveDisputeForReview,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
		schema: {
			params: uuidParamsSchema("disputeId"),
			body: disputeResolveBodySchema,
			response: {
				200: adminDisputeResponseSchema,
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
};
