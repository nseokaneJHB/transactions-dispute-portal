import type { DisputeNotification } from "@transaction-dispute-portal/shared";

import { env } from "./env.js";

const PUBLISH_TIMEOUT_MS = 2000;

/**
 * Publish a dispute's id and new status to its owner's per-user ntfy topic
 * (`docs/dev-tools.md`). Best-effort — a failed or slow publish is logged
 * and swallowed, never blocking or failing the resolve request.
 *
 * @param userId - The dispute owner; scopes the topic so one customer's
 *   activity is not visible on another's.
 * @param notification - The dispute id and its new status, sent as a JSON
 *   message body (`disputeNotificationSchema`).
 */
export const publishDisputeUpdate = async (
	userId: string,
	notification: DisputeNotification,
): Promise<void> => {
	try {
		await fetch(`${env.NTFY_URL}/dispute-updates-${userId}`, {
			method: "POST",
			body: JSON.stringify(notification),
			signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("Failed to publish dispute update:", { userId, error });
	}
};
