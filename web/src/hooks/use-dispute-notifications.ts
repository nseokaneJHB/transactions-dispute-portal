import { useEffect } from "react";

import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
	disputeNotificationSchema,
	type DisputeNotification,
} from "@transaction-dispute-portal/shared";

import { formatZar, humanize } from "@/lib/format";
import { QUERY_KEYS } from "@/api/constant";
import { disputeRequest } from "@/api/dispute";
import { env } from "@/lib/env";
import { refreshQuery } from "@/lib/query";

/** The ntfy SSE frame's `message` field, parsed as a `DisputeNotification` — `undefined` for anything else. */
const parseNotification = (data: string): DisputeNotification | undefined => {
	try {
		const { message } = JSON.parse(data) as { message?: string };
		const parsed = disputeNotificationSchema.safeParse(
			JSON.parse(message ?? ""),
		);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
};

/**
 * Subscribe to the caller's per-user ntfy topic and toast whenever a dispute of
 * theirs changes status (the event-driven notification from
 * `docs/dev-tools.md`). The stream only carries the dispute id and status, so
 * the toast looks the dispute up through the authenticated API to name the
 * merchant and amount, and offers a "View" link straight to it. Live,
 * self-hosted, best-effort — a dropped stream never affects the page.
 */
export const useDisputeNotifications = (userId: string): void => {
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!userId) return;

		const url = `${env.VITE_NTFY_URL}/dispute-updates-${userId}/sse`;
		const source = new EventSource(url);

		source.addEventListener("message", (event) => {
			const notification = parseNotification((event as MessageEvent).data);
			if (!notification) return;

			const { dispute_id: disputeId, status } = notification;

			void refreshQuery(queryClient, router, [
				QUERY_KEYS.DISPUTES,
				[...QUERY_KEYS.DISPUTE, disputeId],
			]);

			const view = {
				label: "View",
				onClick: () =>
					void router.navigate({
						to: "/disputes/$disputeId",
						params: { disputeId },
					}),
			};

			disputeRequest({ data: disputeId })
				.then(({ data: dispute }) =>
					toast.info(`Dispute ${humanize(status).toLowerCase()}`, {
						description: `${dispute.transaction.merchant_name} · ${formatZar(dispute.transaction.amount_cents)} is now ${humanize(status)}.`,
						action: view,
					}),
				)
				.catch(() =>
					toast.info("Dispute update", {
						description: `One of your disputes is now ${humanize(status)}.`,
						action: view,
					}),
				);
		});

		source.onerror = () => source.close();

		return () => source.close();
	}, [userId, router, queryClient]);
};
