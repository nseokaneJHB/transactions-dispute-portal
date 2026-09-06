import { FRONTEND_URLS } from "@transaction-dispute-portal/shared";

import { connection } from "../database/config.js";
import { findUserById } from "../database/repository/user.js";
import { hasKnownDeviceSession } from "../database/repository/session.js";

import { buildNewDeviceLoginEmail } from "../email/new-device-login.js";

import { env } from "./env.js";
import { sendEmail } from "./mailer.js";

interface CreatedSession {
	id: string;
	userId: string;
	ipAddress?: string | null;
	userAgent?: string | null;
}

/**
 * Fire a new-device alert if this session's `user_agent` has not been seen on
 * the account before. Best-effort and non-blocking — never part of the login
 * response (`docs/auth.md` §3). A missing `user_agent` is skipped: it can't be
 * matched against history and only non-browser clients omit it.
 */
export const alertOnNewDeviceLogin = async (
	session: CreatedSession,
): Promise<void> => {
	if (!session.userAgent) return;

	const known = await hasKnownDeviceSession(connection, {
		userId: session.userId,
		userAgent: session.userAgent,
		excludeSessionId: session.id,
	});

	if (known) return;

	const user = await findUserById(connection, session.userId);
	if (!user) return;

	await sendEmail(
		buildNewDeviceLoginEmail({
			to: user.email,
			name: user.name,
			at: new Date(),
			ipAddress: session.ipAddress ?? null,
			userAgent: session.userAgent,
			signInUrl: `${env.FRONTEND_URL}${FRONTEND_URLS.SIGN_IN}`,
		}),
	);
};
