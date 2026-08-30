import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import { z } from "zod";

import {
	USER_ROLE,
	API_PATHS,
	uuidSchema,
	globalResponseSchema,
	transactionsQuerySchema,
	transactionResponseSchema,
	transactionListResponseSchema,
} from "@transaction-dispute-portal/shared";

import { getTransaction, listTransactions } from "./service.js";

const transactionParamsSchema = z.object({ transactionId: uuidSchema });

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "GET",
		url: API_PATHS.TRANSACTIONS,
		handler: listTransactions,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.CUSTOMER)],
		schema: {
			querystring: transactionsQuerySchema,
			response: {
				200: transactionListResponseSchema,
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
		url: API_PATHS.TRANSACTION_DETAIL,
		handler: getTransaction,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.CUSTOMER)],
		schema: {
			params: transactionParamsSchema,
			response: {
				200: transactionResponseSchema,
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
