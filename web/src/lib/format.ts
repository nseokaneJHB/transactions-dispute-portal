import { format, parseISO } from "date-fns";

import { stringToTitleCase } from "@transaction-dispute-portal/shared";

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

/** Human label for any SCREAMING_SNAKE enum value (`UNDER_REVIEW` -> `Under Review`). */
export const humanize = (value: string): string => stringToTitleCase(value);
