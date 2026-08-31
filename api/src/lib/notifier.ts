import { env } from "./env.js";

const PUBLISH_TIMEOUT_MS = 2000;

/**
 * Publish a dispute's new status to its owner's per-user ntfy topic
 * (`docs/notifications.md`). Best-effort — a failed or slow publish is logged
 * and swallowed, never blocking or failing the resolve request.
 *
 * @param userId - The dispute owner; scopes the topic so one customer's
 *   activity is not visible on another's.
 * @param status - The new dispute status, sent as the message body.
 */
export const publishDisputeUpdate = async (
	userId: string,
	status: string,
): Promise<void> => {
	try {
		await fetch(`${env.NTFY_URL}/dispute-updates-${userId}`, {
			method: "POST",
			body: status,
			signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("Failed to publish dispute update:", { userId, error });
	}
};
