import {
	and,
	asc,
	Column,
	desc,
	getTableName,
	gte,
	ilike,
	is,
	lte,
	or,
	sql,
	type SQL,
} from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";

import {
	BUSINESS_TIMEZONE,
	CURSOR_DIRECTION,
	decodeCursor,
	encodeCursor,
	LAST_PAGE_CURSOR,
	ORDER_DIRECTION,
} from "@transaction-dispute-portal/shared";
import type { OrderDirection } from "@transaction-dispute-portal/shared";

/** `from`/`to` are `YYYY-MM-DD` calendar dates in `BUSINESS_TIMEZONE`; these convert a day's boundaries to the UTC instants the timestamp columns are compared against. */
const startOfBusinessDay = (dateOnly: string): Date =>
	fromZonedTime(`${dateOnly}T00:00:00.000`, BUSINESS_TIMEZONE);

const endOfBusinessDay = (dateOnly: string): Date =>
	fromZonedTime(`${dateOnly}T23:59:59.999`, BUSINESS_TIMEZONE);

/**
 * One page of a list, plus the `?cursor=` values for the pages either side of
 * it — `null` where there is none.
 */
export interface CursorPage<T> {
	rows: T[];
	nextCursor: string | null;
	prevCursor: string | null;
}

/** One `ORDER BY` key of a list and the direction the list reads it in. */
export interface SeekKey {
	expression: Column | SQL;
	direction: OrderDirection;
}

/**
 * The ordering a list is read in: `sort` / `order` as the query named them
 * (what a cursor is issued for) and the `ORDER BY` keys that implement it. The
 * last key must be unique — the row's `id` — so every row has exactly one
 * position. `acrossTables` marks a first key on a different table from the
 * rest, which changes how the seek is bounded (`comesAfter`).
 */
export interface SeekOrder {
	sort: string;
	order: OrderDirection;
	keys: SeekKey[];
	acrossTables?: boolean;
}

/** A single sortable column with `id` as the tie-break, both read in `order`. */
export const sortedBy = (
	sort: string,
	order: OrderDirection,
	column: Column | SQL,
	id: Column,
): SeekOrder => ({
	sort,
	order,
	keys: [
		{ expression: column, direction: order },
		{ expression: id, direction: order },
	],
	acrossTables:
		is(column, Column) && getTableName(column.table) !== getTableName(id.table),
});

/** How the page was asked for: the start of the list, either side of a cursor, or the far end. */
type Reading = "first" | "next" | "prev" | "last";

const flip = (direction: OrderDirection): OrderDirection =>
	direction === ORDER_DIRECTION.asc ? ORDER_DIRECTION.desc : ORDER_DIRECTION.asc;

/** A key's value as the text a cursor carries — a timestamp keeps its microseconds, which a JS `Date` would drop. */
const seekText = (expression: Column | SQL): SQL =>
	"getSQLType" in expression &&
	expression.getSQLType().startsWith("timestamp")
		? sql`to_char(${expression} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
		: sql`(${expression})::text`;

const row = (parts: (Column | SQL | string)[]): SQL =>
	sql`(${sql.join(
		parts.map((part) => sql`${part}`),
		sql`, `,
	)})`;

/**
 * "Comes after `anchor` in the order `keys` are read in." Keys that run the
 * same way are compared as one row value, which a composite index takes as
 * the point to start reading from; a change of direction (the review queue's
 * `id DESC` under ascending columns) continues the comparison on the rows tied
 * so far, behind an inclusive bound on the first group so the scan still
 * starts at the position. `acrossTables` (a dispute list sorted by the joined
 * transaction's amount, tie-broken by the dispute's id) gets a plain bound on
 * the first key instead: a row value that mixes tables can't be an index
 * condition, that bound can. Only one kind of bound is ever added — an extra
 * one on the same index's first column makes Postgres start the scan at the
 * looser of the two.
 */
const comesAfter = (
	keys: SeekKey[],
	anchor: string[],
	acrossTables: boolean,
): SQL => {
	const groups: { keys: SeekKey[]; anchor: string[] }[] = [];
	keys.forEach((key, index) => {
		const group = groups.at(-1);
		if (group && group.keys[0]!.direction === key.direction) {
			group.keys.push(key);
			group.anchor.push(anchor[index]!);
		} else {
			groups.push({ keys: [key], anchor: [anchor[index]!] });
		}
	});

	const compare = (
		group: (typeof groups)[number],
		inclusive: boolean,
	): SQL => {
		const ascending = group.keys[0]!.direction === ORDER_DIRECTION.asc;
		const operator = `${ascending ? ">" : "<"}${inclusive ? "=" : ""}`;
		return sql`${row(group.keys.map((key) => key.expression))} ${sql.raw(operator)} ${row(group.anchor)}`;
	};

	const strictlyAfter = (from: number): SQL => {
		const group = groups[from]!;
		if (from === groups.length - 1) return compare(group, false);
		return sql`(${compare(group, false)} or (${row(group.keys.map((key) => key.expression))} = ${row(group.anchor)} and ${strictlyAfter(from + 1)}))`;
	};

	const leading = groups[0]!;
	if (acrossTables) {
		const firstKey = { keys: [leading.keys[0]!], anchor: [leading.anchor[0]!] };
		return sql`${compare(firstKey, true)} and ${strictlyAfter(0)}`;
	}

	return groups.length === 1
		? strictlyAfter(0)
		: sql`${compare(leading, true)} and ${strictlyAfter(0)}`;
};

/**
 * Keyset pagination for one list query. From the `?cursor=` it works out
 * where the page sits and returns the pieces the query plugs in: `where` (the
 * rows past the cursor, `undefined` from either end), `orderBy`, `limit` (one
 * extra row, to tell whether a further page exists) and `seek` (a column of
 * each row's key values, for the cursors). A `prev` cursor and `last` read the
 * list backwards so the `LIMIT` takes the rows nearest that end; `toPage`
 * puts them back in list order, drops `seek` and encodes the neighbouring
 * cursors. No `OFFSET` anywhere, so every page costs the same however deep it
 * is.
 */
export const keyset = (
	order: SeekOrder,
	cursor: string | undefined,
	limit: number,
) => {
	const position =
		cursor && cursor !== LAST_PAGE_CURSOR ? decodeCursor(cursor) : undefined;
	const reading: Reading =
		cursor === LAST_PAGE_CURSOR ? "last" : (position?.direction ?? "first");
	const backwards = reading === "prev" || reading === "last";

	const readKeys = order.keys.map((key) => ({
		expression: key.expression,
		direction: backwards ? flip(key.direction) : key.direction,
	}));

	const cursorAt = (
		direction: (typeof CURSOR_DIRECTION)[keyof typeof CURSOR_DIRECTION],
		seek: string[],
	): string =>
		encodeCursor({
			direction,
			sort: order.sort,
			order: order.order,
			values: seek.slice(0, -1),
			id: seek.at(-1)!,
		});

	return {
		where: position
			? comesAfter(
					readKeys,
					[...position.values, position.id],
					order.acrossTables ?? false,
				)
			: undefined,
		orderBy: readKeys.map((key) =>
			key.direction === ORDER_DIRECTION.asc
				? asc(key.expression)
				: desc(key.expression),
		),
		limit: limit + 1,
		seek: sql<string[]>`array[${sql.join(
			order.keys.map((key) => seekText(key.expression)),
			sql`, `,
		)}]`,

		toPage: <T extends { seek: string[] }>(
			probed: T[],
		): CursorPage<Omit<T, "seek">> => {
			const hasFurther = probed.length > limit;
			const kept = probed.slice(0, limit);
			if (backwards) kept.reverse();

			const hasNext =
				reading === "prev" || ((reading === "first" || reading === "next") && hasFurther);
			const hasPrev = reading === "next" || (backwards && hasFurther);

			const first = kept[0];
			const last = kept.at(-1);

			return {
				rows: kept.map(({ seek, ...rest }) => rest),
				nextCursor:
					hasNext && last ? cursorAt(CURSOR_DIRECTION.next, last.seek) : null,
				prevCursor:
					hasPrev && first ? cursorAt(CURSOR_DIRECTION.prev, first.seek) : null,
			};
		},
	};
};

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
 * end of its, both in `BUSINESS_TIMEZONE` regardless of the server's own clock,
 * so both ends cover the whole business day. `undefined` when neither bound is
 * set, so it drops cleanly out of an `and()`.
 */
export const withinDays = (
	column: Column,
	from: string | undefined,
	to: string | undefined,
): SQL | undefined =>
	and(
		from ? gte(column, startOfBusinessDay(from)) : undefined,
		to ? lte(column, endOfBusinessDay(to)) : undefined,
	);

/** An inclusive `[min, max]` predicate over an amount column (ZAR cents); `undefined` when neither bound is set. */
export const withinAmount = (
	column: Column,
	min: number | undefined,
	max: number | undefined,
): SQL | undefined =>
	and(
		min !== undefined ? gte(column, min) : undefined,
		max !== undefined ? lte(column, max) : undefined,
	);
