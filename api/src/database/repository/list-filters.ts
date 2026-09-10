import {
	and,
	asc,
	desc,
	gte,
	ilike,
	lte,
	or,
	type Column,
	type SQL,
} from "drizzle-orm";
import { endOfDay, parseISO, startOfDay } from "date-fns";

import { ORDER_DIRECTION } from "@transaction-dispute-portal/shared";
import type { OrderDirection } from "@transaction-dispute-portal/shared";

/** One page of rows plus the full (unpaginated) match count. */
export interface Page<T> {
	rows: T[];
	total: number;
}

const LIKE_METACHARACTERS = /[\\%_]/g;

/**
 * A case-insensitive "contains `term`" predicate over one or more columns —
 * matches when any column contains the term. The term is escaped so a `%` or
 * `_` the user typed is matched literally, not as a `LIKE` wildcard. Returns
 * `undefined` for no columns, so it drops cleanly out of an `and()`.
 */
export const containsText = (
	term: string,
	...columns: Column[]
): SQL | undefined => {
	if (columns.length === 0) return undefined;

	const pattern = `%${term.replace(LIKE_METACHARACTERS, "\\$&")}%`;
	const clauses = columns.map((column) => ilike(column, pattern));

	return clauses.length === 1 ? clauses[0] : or(...clauses);
};

/**
 * An inclusive predicate for a `[from, to]` date-only range (`YYYY-MM-DD`) over
 * a timestamp `column` — `from` snaps to the start of its day and `to` to the
 * end of its, so both ends cover the whole day. `undefined` when neither bound
 * is set, so it drops cleanly out of an `and()`.
 */
export const withinDays = (
	column: Column,
	from: string | undefined,
	to: string | undefined,
): SQL | undefined =>
	and(
		from ? gte(column, startOfDay(parseISO(from))) : undefined,
		to ? lte(column, endOfDay(parseISO(to))) : undefined,
	);

/** The Drizzle order helper for the requested direction — descending when unset. */
export const sortDirection = (order: OrderDirection | undefined) =>
	order === ORDER_DIRECTION.asc ? asc : desc;
