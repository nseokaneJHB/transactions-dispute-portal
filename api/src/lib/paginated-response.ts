import { HTTP_RESPONSE_CODE } from "@transaction-dispute-portal/shared";

interface PageInput<T> {
	/** The validated list query — its `page` / `limit` go straight onto the envelope. */
	query: { page: number; limit: number };
	/** The full (unpaginated) match count. */
	total: number;
	/** The rows for this page, already mapped to their wire shape. */
	rows: T[];
	message: string;
}

/**
 * Build the paginated response envelope every list endpoint returns
 * (`docs/api.md` — `count` is the full match total, `total` the rows on this
 * page). Returned as a plain object so the caller's `reply.send(...)` is still
 * checked against the route's zod response schema.
 */
export const paginatedResponse = <T>({ query, total, rows, message }: PageInput<T>) => ({
	code: HTTP_RESPONSE_CODE.OK.code,
	message,
	page: query.page,
	limit: query.limit,
	count: total,
	total: rows.length,
	data: rows,
});
