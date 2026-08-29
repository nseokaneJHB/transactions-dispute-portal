import { APP_NAME } from "@transaction-dispute-portal/shared";

import type { EmailContent } from "../lib/mailer.js";

interface OtpEmailSignInRequestPayload {
	otp: string;
	email: string;
	expiresInMinutes: number;
}

/**
 * Build the sign-in one-time-code email sent on every login attempt.
 *
 * @param payload - The recipient address, the OTP code, and how many minutes
 *   the code stays valid.
 * @returns The recipient, subject, and HTML body for the mailer.
 */
export const buildOtpEmailSignInRequest = (
	payload: OtpEmailSignInRequestPayload,
): EmailContent => ({
	to: payload.email,
	subject: `Your ${APP_NAME} sign-in code`,
	html: `
		<div style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
			<div style="max-width: 480px; margin: auto;">
				<p>Use this code to finish signing in to <strong>${APP_NAME}</strong>:</p>
				<p style="
					margin: 24px 0;
					font-size: 28px;
					font-weight: bold;
					text-align: center;
					letter-spacing: 8px;
					background: #f3f3f3;
					padding: 16px 0;
				">${payload.otp}</p>
				<p style="color: #909090; font-size: 14px;">
					This code expires in ${payload.expiresInMinutes} minutes. If you didn't
					try to sign in, you can ignore this email.
				</p>
			</div>
		</div>
	`,
});
