import type { FastifyInstance } from "fastify";

import { API_URLS } from "@transaction-dispute-portal/shared";

import { route as healthRoute } from "../modules/check/route.js";

import { env } from "../lib/env.js";

/**
 * Mount every route module under its namespace prefix. Health checks stay
 * unversioned (`docs/decisions.md` #18); versioned modules land under `/v1`.
 */
export const route = async (app: FastifyInstance): Promise<void> => {
	const { HEALTH } = API_URLS(env.API_VERSION);

	await app.register(healthRoute, { prefix: HEALTH });
};
