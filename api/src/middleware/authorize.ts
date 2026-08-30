import type { FastifyReply, FastifyRequest } from "fastify";

import {
	HTTP_RESPONSE_CODE,
	type GlobalResponse,
	type Role,
} from "@transaction-dispute-portal/shared";

/**
 * Require the authenticated user to hold one of `allowedRoles`. Runs after
 * `authenticate`, which has already put the user on the request.
 *
 * @param allowedRoles - A role, or list of roles, permitted on this route.
 */
export const authorize = (allowedRoles: Role | Role[]) => {
	const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

	return async (
		request: FastifyRequest,
		reply: FastifyReply,
	): Promise<void> => {
		const user = request.user;

		if (!user || !roles.includes(user.role)) {
			const { status, code } = HTTP_RESPONSE_CODE.FORBIDDEN;
			const response: GlobalResponse = {
				code,
				message: "Insufficient permissions.",
			};

			return reply.status(status).send(response);
		}
	};
};
