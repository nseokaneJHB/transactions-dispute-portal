import { format, formatDistanceToNow, parseISO } from "date-fns";

import {
	DISPUTE_STATUS,
	stringToTitleCase,
	type DisputeStatus,
} from "@transaction-dispute-portal/shared";

const zarFormatter = new Intl.NumberFormat("en-ZA", {
	style: "currency",
	currency: "ZAR",
});

/** Render an integer cent amount as `R1 234,56`. */
export const formatZar = (amountCents: number): string =>
	zarFormatter.format(amountCents / 100);

/** `6 September 2026` — a full, unambiguous date. */
export const formatDate = (iso: string): string =>
	format(parseISO(iso), "d MMMM yyyy");

/** `6 Sept 2026, 14:32` — date with time, for audit-style timestamps. */
export const formatDateTime = (iso: string): string =>
	format(parseISO(iso), "d MMM yyyy, HH:mm");

/** `3 days ago` — relative time for list rows. */
export const formatRelative = (iso: string): string =>
	`${formatDistanceToNow(parseISO(iso))} ago`;

/** Human label for any SCREAMING_SNAKE enum value (`UNDER_REVIEW` -> `Under Review`). */
export const humanize = (value: string): string => stringToTitleCase(value);

/** The Tailwind text colour token for each dispute status badge. */
export const disputeStatusTone: Record<DisputeStatus, string> = {
	[DISPUTE_STATUS.SUBMITTED]: "text-status-submitted",
	[DISPUTE_STATUS.UNDER_REVIEW]: "text-status-under-review",
	[DISPUTE_STATUS.RESOLVED]: "text-status-resolved",
	[DISPUTE_STATUS.REJECTED]: "text-status-rejected",
	[DISPUTE_STATUS.WITHDRAWN]: "text-status-withdrawn",
};
