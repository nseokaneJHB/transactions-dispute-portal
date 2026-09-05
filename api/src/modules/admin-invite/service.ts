import { randomBytes } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import { addHours } from "date-fns";

import {
	USER_ROLE,
	FRONTEND_URLS,
	HTTP_RESPONSE_CODE,
	ADMIN_INVITE_EXPIRY_HOURS,
} from "@transaction-dispute-portal/shared";
import type { AdminInvite } from "@transaction-dispute-portal/shared";

import {
	createAdminInvite,
	acceptAdminInvite,
	findAdminInviteByToken,
	createUser,
	findUserByEmail,
} from "../../database/repository/index.js";
import type { AdminInviteModelSelect } from "../../database/schema/index.js";

import { env } from "../../lib/env.js";
import { sendEmail } from "../../lib/mailer.js";

import { buildAdminInviteEmail } from "../../email/admin-invite.js";

import type { AcceptInviteRequest, SendInviteRequest } from "./type.js";

const TOKEN_BYTES = 32;

const toWire = (row: AdminInviteModelSelect): AdminInvite => ({
	id: row.id,
	email: row.email,
	accepted_at: row.accepted_at ? row.accepted_at.toISOString() : null,
	expires_at: row.expires_at.toISOString(),
	created_at: row.created_at.toISOString(),
});

const acceptUrl = (token: string): string =>
	`${env.FRONTEND_URL}${FRONTEND_URLS.ADMIN_INVITE_ACCEPT}?${new URLSearchParams(
		{ token },
	).toString()}`;

/** `POST /v1/admin/invites` — an existing admin invites a new admin by email. */
export const sendInvite = async (
	request: FastifyRequest<SendInviteRequest>,
	reply: FastifyReply<SendInviteRequest>,
): Promise<void> => {
	const { email } = request.body;

	const existing = await findUserByEmail(request.server.connection, email);

	if (existing) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "An account already exists for that email." });
	}

	const token = randomBytes(TOKEN_BYTES).toString("hex");

	const invite = await createAdminInvite(request.server.connection, {
		email,
		token,
		expiresAt: addHours(new Date(), ADMIN_INVITE_EXPIRY_HOURS),
		invitedBy: request.user!.id,
	});

	await sendEmail(
		buildAdminInviteEmail({
			email,
			acceptUrl: acceptUrl(token),
			expiresInHours: ADMIN_INVITE_EXPIRY_HOURS,
		}),
	);

	const { status, code } = HTTP_RESPONSE_CODE.CREATED;
	return reply.status(status).send({
		code,
		message: "Invite sent.",
		data: toWire(invite),
	});
};

/**
 * `POST /v1/admin/invites/:token/accept` — unauthenticated: the invitee has no
 * account yet. Creates the admin account; login is still email-OTP from there.
 */
export const acceptInvite = async (
	request: FastifyRequest<AcceptInviteRequest>,
	reply: FastifyReply<AcceptInviteRequest>,
): Promise<void> => {
	const { token } = request.params;
	const { name } = request.body;

	const invite = await findAdminInviteByToken(
		request.server.connection,
		token,
	);

	if (!invite) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply.status(status).send({ code, message: "Invite not found." });
	}

	if (invite.accepted_at) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This invite has already been used." });
	}

	if (invite.expires_at.getTime() <= Date.now()) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This invite has expired." });
	}

	const created = await request.server.connection.transaction(async (tx) => {
		const accepted = await acceptAdminInvite(tx, token);
		if (!accepted) return undefined;

		return createUser(tx, {
			name,
			email: invite.email,
			role: USER_ROLE.ADMIN,
		});
	});

	if (!created) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This invite is no longer valid." });
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Admin account created. Sign in with your email to continue.",
		redirectUrl: FRONTEND_URLS.SIGN_IN,
	});
};
