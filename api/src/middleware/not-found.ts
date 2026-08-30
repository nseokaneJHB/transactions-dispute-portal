import type { FastifyReply, FastifyRequest } from "fastify";

import {
	HTTP_RESPONSE_CODE,
	type GlobalResponse,
} from "@transaction-dispute-portal/shared";

/**
 * Catch-all for unmatched routes, so a `404` carries the same envelope as every
 * other response instead of Fastify's default `{ error, message, statusCode }`.
 */
export const notFound = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
	const response: GlobalResponse = {
		code,
		message: `Route ${request.method} ${request.url} does not exist.`,
	};

	return reply.status(status).send(response);
};
