import { z } from "zod";

import { DEFAULT_PAGE_LIMIT, DEFAULT_PAGE_NUMBER } from "../constant.js";

import {
	stringSchema,
	numberSchema,
	httpCodeSchema,
	fromDateQuerySchema,
	limitQuerySchema,
	orderDirectionSchema,
	pageQuerySchema,
	searchQuerySchema,
	toDateQuerySchema,
} from "./field.js";

/**
 * The pagination, ordering, text-search and date-range keys every list query
 * carries. Endpoints extend this with their own filters and a whitelisted
 * `sort` column (`disputesQuerySchema`, `transactionsQuerySchema`,
 * `adminInvitesQuerySchema`) rather than re-declaring `page` / `limit` /
 * `order` / `search` / `from` / `to`.
 */
export const paginationQuerySchema = z.object({
	page: pageQuerySchema,
	limit: limitQuerySchema,
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
	count: numberSchema.describe("Total number of items available"),
	total: numberSchema.describe("Total number of items returned in this page"),
	page: numberSchema
		.default(DEFAULT_PAGE_NUMBER)
		.describe("Current page number"),
	limit: numberSchema
		.default(DEFAULT_PAGE_LIMIT)
		.describe("Number of items per page"),
});
