import { useEffect } from "react";

import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { humanize } from "@/lib/format";
import { QUERY_KEYS } from "@/api/constant";
import { env } from "@/lib/env";
import { refreshQuery } from "@/lib/query";

/**
 * Subscribe to the caller's per-user ntfy topic and surface a toast whenever a
 * dispute of theirs changes status (the event-driven notification from
 * `docs/notifications.md`). Live, self-hosted, best-effort — a dropped stream
 * never affects the page.
 */
export const useDisputeNotifications = (userId: string): void => {
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!userId) return;

		const url = `${env.VITE_NTFY_URL}/dispute-updates-${userId}/sse`;
		const source = new EventSource(url);

		source.addEventListener("message", (event) => {
			let status: string;
			try {
				status = JSON.parse((event as MessageEvent).data).message;
			} catch {
				return;
			}
			if (!status) return;

			toast.info("Dispute update", {
				description: `One of your disputes is now ${humanize(status)}.`,
			});

			void refreshQuery(queryClient, router, [QUERY_KEYS.DISPUTES]);
		});

		source.onerror = () => source.close();

		return () => source.close();
	}, [userId, router, queryClient]);
};
