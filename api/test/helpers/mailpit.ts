const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MessageSummary {
	ID: string;
	Subject: string;
	To: { Address: string }[];
}

interface MessageBody {
	Text: string;
	HTML: string;
}

/** Delete every message in the Mailpit inbox. */
export const clearInbox = async (): Promise<void> => {
	await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
};

const listMessages = async (): Promise<MessageSummary[]> => {
	const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
	const body = (await response.json()) as { messages: MessageSummary[] };
	return body.messages;
};

const readMessage = async (id: string): Promise<string> => {
	const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
	const body = (await response.json()) as MessageBody;
	return `${body.Text}\n${body.HTML}`;
};

interface WaitOptions {
	to: string;
	subjectIncludes?: string;
	timeoutMs?: number;
}

/** Poll until a message matching `to` (and optionally a subject fragment) arrives, then return its body. */
export const waitForEmail = async (options: WaitOptions): Promise<string> => {
	const deadline = Date.now() + (options.timeoutMs ?? 10_000);

	while (Date.now() < deadline) {
		const messages = await listMessages();
		const match = messages.find(
			(message) =>
				message.To.some((recipient) => recipient.Address === options.to) &&
				(!options.subjectIncludes ||
					message.Subject.includes(options.subjectIncludes)),
		);

		if (match) return readMessage(match.ID);

		await new Promise((resolve) => setTimeout(resolve, 150));
	}

	throw new Error(`No email for ${options.to} within the timeout.`);
};

/** Count messages matching a subject fragment sent to an address. */
export const countEmails = async (
	to: string,
	subjectIncludes: string,
): Promise<number> => {
	const messages = await listMessages();
	return messages.filter(
		(message) =>
			message.Subject.includes(subjectIncludes) &&
			message.To.some((recipient) => recipient.Address === to),
	).length;
};

/** Pull the first 6-digit run out of an email body (the OTP). */
export const extractOtp = (body: string): string => {
	const match = body.match(/\b(\d{6})\b/);
	if (!match) throw new Error("No OTP in the email body.");
	return match[1];
};

/** Pull the `token=` query value out of a link in an email body. */
export const extractToken = (body: string): string => {
	const match = body.match(/token=([A-Za-z0-9._-]+)/);
	if (!match) throw new Error("No token in the email body.");
	return match[1];
};
