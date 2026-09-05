import { APP_NAME } from "@transaction-dispute-portal/shared";

import type { EmailContent } from "../lib/mailer.js";

interface EmailChangeApprovalPayload {
	to: string;
	newEmail: string;
	approveUrl: string;
	expiresInMinutes: number;
}

/**
 * Build the approval email sent to the account's *current* address when an
 * email change is requested. Nothing changes until this link is followed, so
 * an attacker with a live session still can't redirect where OTP codes go.
 */
export const buildEmailChangeApprovalEmail = (
	payload: EmailChangeApprovalPayload,
): EmailContent => ({
	to: payload.to,
	subject: `Approve the email change on your ${APP_NAME} account`,
	html: `
		<div style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
			<div style="max-width: 480px; margin: auto;">
				<p>Someone asked to change the sign-in email on your <strong>${APP_NAME}</strong>
					account to <strong>${payload.newEmail}</strong>.</p>
				<p style="margin: 24px 0; text-align: center;">
					<a href="${payload.approveUrl}" style="
						display: inline-block;
						padding: 12px 24px;
						background: #1a1a1a;
						color: #ffffff;
						text-decoration: none;
						border-radius: 4px;
					">Approve this change</a>
				</p>
				<p style="color: #909090; font-size: 14px;">
					This link expires in ${payload.expiresInMinutes} minutes. If you didn't
					request this, do nothing — the change won't happen, and you should sign
					in and end any other sessions.
				</p>
			</div>
		</div>
	`,
});
