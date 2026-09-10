import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
	OTP,
	USER_ROLE,
	API_PATHS,
	globalResponseSchema,
	adminInviteCreateBodySchema,
	adminInviteAcceptBodySchema,
	adminInviteTokenParamsSchema,
	adminInvitesQuerySchema,
	adminInviteResponseSchema,
	adminInviteListResponseSchema,
} from "@transaction-dispute-portal/shared";

import { acceptInvite, listInvites, sendInvite } from "./service.js";

const ACCEPT_RATE_LIMIT = { max: OTP.MAX_ATTEMPTS * 2 };

export const route: FastifyPluginAsync = async (
	app: FastifyInstance,
): Promise<void> => {
	app.route({
		method: "GET",
		url: API_PATHS.ADMIN_INVITES,
		handler: listInvites,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
		schema: {
			querystring: adminInvitesQuerySchema,
			response: {
				200: adminInviteListResponseSchema,
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
		url: API_PATHS.ADMIN_INVITES,
		handler: sendInvite,
		preHandler: [app.authenticate, app.authorize(USER_ROLE.ADMIN)],
		schema: {
			body: adminInviteCreateBodySchema,
			response: {
				201: adminInviteResponseSchema,
				401: globalResponseSchema,
				403: globalResponseSchema,
				409: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});

	app.route({
		method: "POST",
		url: API_PATHS.ADMIN_INVITE_ACCEPT,
		handler: acceptInvite,
		config: { rateLimit: ACCEPT_RATE_LIMIT },
		schema: {
			params: adminInviteTokenParamsSchema,
			body: adminInviteAcceptBodySchema,
			response: {
				200: globalResponseSchema,
				404: globalResponseSchema,
				409: globalResponseSchema,
				422: globalResponseSchema,
				429: globalResponseSchema,
				500: globalResponseSchema,
			},
		},
	});
};
