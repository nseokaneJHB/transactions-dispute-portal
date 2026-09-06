import { APP_NAME } from "@transaction-dispute-portal/shared";

import type { EmailContent } from "../lib/mailer.js";

interface NewDeviceLoginPayload {
	to: string;
	name: string;
	at: Date;
	ipAddress: string | null;
	userAgent: string | null;
	signInUrl: string;
}

/** Build the alert sent when an account signs in from a device it hasn't been seen on. */
export const buildNewDeviceLoginEmail = (
	payload: NewDeviceLoginPayload,
): EmailContent => ({
	to: payload.to,
	subject: `New sign-in to your ${APP_NAME} account`,
	html: `
		<div style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
			<div style="max-width: 480px; margin: auto;">
				<p>Hi ${payload.name}, your ${APP_NAME} account was just signed in to from a device we haven't seen before.</p>
				<ul style="color: #555; font-size: 14px; line-height: 1.6;">
					<li>When: ${payload.at.toUTCString()}</li>
					<li>IP address: ${payload.ipAddress ?? "unknown"}</li>
					<li>Device: ${payload.userAgent ?? "unknown"}</li>
				</ul>
				<p>If this was you, nothing more to do. If it wasn't, sign in and end other
					sessions right away — your email is the only key to this account.</p>
				<p style="color: #909090; font-size: 14px;">Sign in at <a href="${payload.signInUrl}">${payload.signInUrl}</a></p>
			</div>
		</div>
	`,
});
