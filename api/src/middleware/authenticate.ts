import type { FastifyReply, FastifyRequest } from "fastify";

import { fromNodeHeaders } from "better-auth/node";

import {
	USER_ROLE,
	FRONTEND_URLS,
	HTTP_RESPONSE_CODE,
	type Role,
	type GlobalResponse,
} from "@transaction-dispute-portal/shared";

import { auth } from "../lib/auth.js";

import type {
	UserModelSelect,
	SessionModelSelect,
} from "../database/schema/index.js";

/** Require a valid Better Auth session, attaching the user and session to the request. */
export const authenticate = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	const headers = fromNodeHeaders(request.headers);

	const result = await auth.api.getSession({ headers });

	if (!result?.session || !result.user) {
		const { status, code } = HTTP_RESPONSE_CODE.UNAUTHENTICATED;
		const response: GlobalResponse = {
			code,
			message: "Unauthenticated.",
			redirectUrl: FRONTEND_URLS.SIGN_IN,
		};

		return reply.status(status).send(response);
	}

	const { user, session } = result;

	request.user = {
		id: user.id,
		name: user.name ?? null,
		email: user.email,
		image: user.image ?? null,
		role: (user.role as Role) ?? USER_ROLE.CUSTOMER,
		email_verified: user.emailVerified,
		created_at: user.createdAt,
		updated_at: user.updatedAt,
	} satisfies UserModelSelect;

	request.session = {
		id: session.id,
		token: session.token,
		user_id: session.userId,
		expires_at: session.expiresAt,
		created_at: session.createdAt,
		updated_at: session.updatedAt,
		ip_address: session.ipAddress ?? null,
		user_agent: session.userAgent ?? null,
	} satisfies SessionModelSelect;
};
