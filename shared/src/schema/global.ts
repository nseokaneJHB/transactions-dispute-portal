import { z } from "zod";

import {
	CURSOR_DIRECTION,
	DEFAULT_PAGE_LIMIT,
	LAST_PAGE_CURSOR,
	ORDER_DIRECTION,
} from "../constant.js";

import {
	stringSchema,
	numberSchema,
	httpCodeSchema,
	fromDateQuerySchema,
	limitQuerySchema,
	maxAmountQuerySchema,
	minAmountQuerySchema,
	orderDirectionSchema,
	searchQuerySchema,
	toDateQuerySchema,
	uuidSchema,
} from "./field.js";

/**
 * A list position: the sort value(s) and id of the row a page starts after
 * (`next`) or ends before (`prev`), on one `sort` / `order`. `values` are the
 * sort key(s) as Postgres prints them, so a timestamp keeps its microseconds —
 * a JS `Date` would round them off and the seek would skip or repeat rows that
 * share a millisecond.
 */
export const seekPositionSchema = z.object({
	direction: z.enum(CURSOR_DIRECTION),
	sort: z.string().min(1).max(32),
	order: orderDirectionSchema,
	values: z.array(z.string().max(255)).min(1).max(2),
	id: uuidSchema,
});

const CURSOR_SEPARATOR = "~";

/** One cursor part, percent-encoded so a `~` inside a merchant or customer name can't be read as a separator. */
const encodePart = (part: string): string =>
	encodeURIComponent(part).replaceAll(CURSOR_SEPARATOR, "%7E");

/** The `cursor` string for a position — what the envelope's `next_cursor` / `prev_cursor` hold. */
export const encodeCursor = (
	position: z.infer<typeof seekPositionSchema>,
): string =>
	[
		position.direction,
		position.sort,
		position.order,
		...position.values,
		position.id,
	]
		.map(encodePart)
		.join(CURSOR_SEPARATOR);

/** The position a `cursor` string holds, or `undefined` when it isn't one. */
export const decodeCursor = (
	cursor: string,
): z.infer<typeof seekPositionSchema> | undefined => {
	try {
		const [direction, sort, order, ...rest] = cursor
			.split(CURSOR_SEPARATOR)
			.map(decodeURIComponent);

		return seekPositionSchema.safeParse({
			direction,
			sort,
			order,
			values: rest.slice(0, -1),
			id: rest.at(-1),
		}).data;
	} catch {
		return undefined;
	}
};

/**
 * `?cursor=` on a list query — a `next_cursor` / `prev_cursor` from a previous
 * page of the same list, passed back unchanged, or `last` for the final page.
 * The page then starts at that row by an index seek rather than by skipping
 * rows, so every page costs the same however deep it is.
 */
export const cursorQuerySchema = z
	.string()
	.max(1024)
	.refine(
		(cursor) =>
			cursor === LAST_PAGE_CURSOR || decodeCursor(cursor) !== undefined,
		"`cursor` must be a `next_cursor` or `prev_cursor` from this list, or `last`",
	)
	.optional()
	.describe(
		"Seek position from a previous page's `next_cursor` / `prev_cursor`, or `last` for the final page",
	);

/** A timestamp sort value as a cursor carries it: UTC with microseconds. */
export const seekTimestampSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);

/** A whole-number sort value (an amount in cents, a derived rank). */
export const seekIntegerSchema = z.string().regex(/^-?\d{1,18}$/);

/** A text sort value (a merchant, a name, an email). */
export const seekTextSchema = z.string().max(255);

/**
 * The pagination, ordering, text-search and date-range keys every list query
 * carries. Endpoints extend this with their own filters and a whitelisted
 * `sort` column (`disputesQuerySchema`, `transactionsQuerySchema`,
 * `adminInvitesQuerySchema`) rather than re-declaring `limit` / `cursor` /
 * `order` / `search` / `from` / `to`.
 */
export const paginationQuerySchema = z.object({
	limit: limitQuerySchema,
	cursor: cursorQuerySchema,
	search: searchQuerySchema,
	from: fromDateQuerySchema,
	to: toDateQuerySchema,
	order: orderDirectionSchema
		.optional()
		.describe(
			"Sort direction on the chosen `sort` column — defaults to descending",
		),
});

/**
 * `from` must not fall after `to`. Applied as a `.refine()` on each concrete
 * list query *after* its `.extend()` — a refined schema can't be extended
 * further, so the shared predicate is applied last, per endpoint.
 */
export const isOrderedDateRange = (query: {
	from?: string;
	to?: string;
}): boolean => !query.from || !query.to || query.from <= query.to;

export const ORDERED_DATE_RANGE_ISSUE = {
	path: ["from"],
	message: "`from` must be on or before `to`",
};

/**
 * A `cursor` points into one ordering of a list — the `sort` / `order` it was
 * issued for — and its sort value(s) must be the kind that sort compares, so
 * a cursor carried over from another sort, or edited by hand, is a `422`
 * rather than a database error. `seekValues` maps each `sort` to the shape of
 * its values; `defaultSort` is the `sort` an unset `?sort=` means. Refined
 * last, like the date range.
 */
export const isCursorForOrder =
	(seekValues: Record<string, z.ZodType>, defaultSort: string) =>
	(query: { cursor?: string; sort?: string; order?: string }): boolean => {
		if (query.cursor === undefined || query.cursor === LAST_PAGE_CURSOR) {
			return true;
		}

		const position = decodeCursor(query.cursor);
		if (!position) return true;

		const sort = query.sort ?? defaultSort;
		const values = seekValues[sort];

		return (
			position.sort === sort &&
			position.order === (query.order ?? ORDER_DIRECTION.desc) &&
			values !== undefined &&
			values.safeParse(position.values).success
		);
	};

export const CURSOR_ORDER_ISSUE = {
	path: ["cursor"],
	message: "`cursor` belongs to a different `sort` / `order` of this list",
};

/**
 * The amount-range filter for lists whose rows carry a transaction amount
 * (transactions and disputes, not invites). Spread into a list query's
 * `.extend()`.
 */
export const amountRangeQueryShape = {
	min_amount_cents: minAmountQuerySchema,
	max_amount_cents: maxAmountQuerySchema,
};

/** `min_amount_cents` must not exceed `max_amount_cents` — refined last, like the date range. */
export const isOrderedAmountRange = (query: {
	min_amount_cents?: number;
	max_amount_cents?: number;
}): boolean =>
	query.min_amount_cents === undefined ||
	query.max_amount_cents === undefined ||
	query.min_amount_cents <= query.max_amount_cents;

export const ORDERED_AMOUNT_RANGE_ISSUE = {
	path: ["min_amount_cents"],
	message: "`min_amount_cents` must be at most `max_amount_cents`",
};

/**
 * Generic global response schema — the default envelope for every API
 * response. Extend with `.extend({ data: ... })` per endpoint when a
 * response actually carries a payload; not every response needs to (e.g.
 * a bare 204/redirect response is valid as-is).
 */
export const globalResponseSchema = z.object({
	code: httpCodeSchema,
	message: stringSchema.describe(
		"Human-readable message describing the result",
	),
	redirectUrl: stringSchema
		.optional()
		.describe("URL to redirect the client, if applicable"),
	errors: z
		.array(
			z.object({
				field: stringSchema.describe("Field that failed validation"),
				message: stringSchema.describe("Validation error description"),
			}),
		)
		.optional()
		.describe("List of error details"),
});

/**
 * Paginated variant of `globalResponseSchema` — extend further with
 * `.extend({ data: ... })` per endpoint for the actual page of items.
 */
export const paginatedGlobalResponseSchema = globalResponseSchema.extend({
	total: numberSchema.describe("Total number of items returned in this page"),
	next_cursor: stringSchema
		.nullable()
		.describe("`cursor` for the page after this one — `null` on the last page"),
	prev_cursor: stringSchema
		.nullable()
		.describe(
			"`cursor` for the page before this one — `null` on the first page",
		),
	limit: numberSchema
		.default(DEFAULT_PAGE_LIMIT)
		.describe("Number of items per page"),
});
