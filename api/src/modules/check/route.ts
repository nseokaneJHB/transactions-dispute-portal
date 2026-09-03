import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	API_PATHS,
	globalResponseSchema,
	healthzResponseSchema,
	readyzResponseSchema,
} from "@transaction-dispute-portal/shared";

import { healthz, readyz } from "./service.js";

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "GET",
		url: API_PATHS.HEALTHZ,
		handler: healthz,
		schema: {
			response: {
				200: healthzResponseSchema,
				503: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "GET",
		url: API_PATHS.READYZ,
		handler: readyz,
		schema: {
			response: {
				200: readyzResponseSchema,
				503: globalResponseSchema,
			},
		},
	});
};
