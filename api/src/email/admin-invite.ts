import { APP_NAME } from "@transaction-dispute-portal/shared";

import type { EmailContent } from "../lib/mailer.js";

interface AdminInviteEmailPayload {
	email: string;
	acceptUrl: string;
	expiresInHours: number;
}

/** Build the invite email that carries the one-time admin-account link. */
export const buildAdminInviteEmail = (
	payload: AdminInviteEmailPayload,
): EmailContent => ({
	to: payload.email,
	subject: `You've been invited to administer ${APP_NAME}`,
	html: `
		<div style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
			<div style="max-width: 480px; margin: auto;">
				<p>You've been invited to an admin account on <strong>${APP_NAME}</strong>.</p>
				<p style="margin: 24px 0; text-align: center;">
					<a href="${payload.acceptUrl}" style="
						display: inline-block;
						padding: 12px 24px;
						background: #1a1a1a;
						color: #ffffff;
						text-decoration: none;
						border-radius: 4px;
					">Accept the invite</a>
				</p>
				<p style="color: #909090; font-size: 14px;">
					This link expires in ${payload.expiresInHours} hours and can be used
					once. After accepting, sign in with a one-time code sent to this
					address. If you weren't expecting this, you can ignore this email.
				</p>
			</div>
		</div>
	`,
});
