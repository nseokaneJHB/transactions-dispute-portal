import { createTransport } from "nodemailer";

import { APP_NAME } from "@transaction-dispute-portal/shared";

import { env } from "./env.js";

export interface EmailContent {
	to: string;
	html: string;
	subject: string;
}

const transport = createTransport({
	host: env.SMTP_HOST,
	port: env.SMTP_PORT,
	secure: env.SMTP_PORT === 465,
	auth: env.SMTP_USER
		? { user: env.SMTP_USER, pass: env.SMTP_PASS }
		: undefined,
});

/**
 * Send a single transactional email through the configured SMTP transport.
 * Failures are logged and swallowed rather than thrown: Better Auth advises
 * against awaiting OTP delivery to avoid timing attacks, so callers fire and
 * forget and a delivery error must not surface as a login failure.
 *
 * @param content - The recipient, subject, and HTML body of the message.
 * @returns A promise that resolves once the send attempt completes.
 */
export const sendEmail = async (content: EmailContent): Promise<void> => {
	try {
		await transport.sendMail({
			to: content.to,
			html: content.html,
			subject: content.subject,
			from: `"${APP_NAME}" <${env.SMTP_FROM}>`,
		});
	} catch (error) {
		console.error("Failed to send email:", { to: content.to, error });
	}
};
