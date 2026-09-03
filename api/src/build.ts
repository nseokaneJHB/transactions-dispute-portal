import type { IncomingMessage } from "node:http";

import Fastify, {
	type FastifyBaseLogger,
	type FastifyInstance,
} from "fastify";

import type { ZodTypeProvider } from "fastify-type-provider-zod";

import "./type/fastify.js";

import { route } from "./route/index.js";
import { middlewares } from "./middleware/index.js";

import { generateUuid } from "./lib/util.js";

/**
 * Construct the fully-wired Fastify app, short of `listen()`.
 *
 * @param logger - The Pino instance to attach; omitted in tests.
 */
export const build = async (
	logger?: FastifyBaseLogger,
): Promise<FastifyInstance> => {
	const app = Fastify({
		trustProxy: true,
		bodyLimit: 1_048_576,
		loggerInstance: logger,
		requestTimeout: 120_000,
		exposeHeadRoutes: false,
		disableRequestLogging: true,
		requestIdLogLabel: "correlationId",
		requestIdHeader: "x-correlation-id",
		genReqId: (request: IncomingMessage) =>
			(request.headers["x-correlation-id"] as string) ??
			(request.headers["x-request-id"] as string) ??
			generateUuid(),
	}).withTypeProvider<ZodTypeProvider>();

	await middlewares(app);
	await route(app);

	await app.ready();

	return app;
};
