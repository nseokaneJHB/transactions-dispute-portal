import type { FastifyInstance } from "fastify";

import { API_URLS } from "@transaction-dispute-portal/shared";

import { route as healthRoute } from "../modules/check/route.js";
import { route as authRoute } from "../modules/authentication/route.js";

import { env } from "../lib/env.js";

/** Mount every route module under its namespace prefix. */
export const route = async (app: FastifyInstance): Promise<void> => {
	const { HEALTH, AUTH } = API_URLS(env.API_VERSION);

	await app.register(healthRoute, { prefix: HEALTH });
	await app.register(authRoute, { prefix: AUTH });
};
