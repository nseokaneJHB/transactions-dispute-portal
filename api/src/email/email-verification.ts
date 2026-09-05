import { APP_NAME } from "@transaction-dispute-portal/shared";

import type { EmailContent } from "../lib/mailer.js";

interface EmailVerificationPayload {
	to: string;
	verifyUrl: string;
	expiresInMinutes: number;
}

/**
 * Build the verification email sent to a *new* address to confirm the account
 * owner controls it. In this app it only fires as the second step of an email
 * change (the first step is approval from the old address).
 */
export const buildEmailVerificationEmail = (
	payload: EmailVerificationPayload,
): EmailContent => ({
	to: payload.to,
	subject: `Confirm this email for your ${APP_NAME} account`,
	html: `
		<div style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
			<div style="max-width: 480px; margin: auto;">
				<p>Confirm this address to finish moving your <strong>${APP_NAME}</strong>
					sign-in email here.</p>
				<p style="margin: 24px 0; text-align: center;">
					<a href="${payload.verifyUrl}" style="
						display: inline-block;
						padding: 12px 24px;
						background: #1a1a1a;
						color: #ffffff;
						text-decoration: none;
						border-radius: 4px;
					">Confirm this email</a>
				</p>
				<p style="color: #909090; font-size: 14px;">
					This link expires in ${payload.expiresInMinutes} minutes. If you didn't
					request an email change, you can ignore this.
				</p>
			</div>
		</div>
	`,
});
