import { HTTP_RESPONSE_CODE } from "@transaction-dispute-portal/shared";

interface PageInput<T> {
	/** The validated list query — its `limit` goes straight onto the envelope. */
	query: { limit: number };
	/** `?cursor=` values for the neighbouring pages — `null` where there is none. */
	nextCursor: string | null;
	prevCursor: string | null;
	/** The rows for this page, already mapped to their wire shape. */
	rows: T[];
	message: string;
}

/**
 * Build the paginated response envelope every list endpoint returns
 * (`docs/backend-service.md` — `total` the rows on this page, `next_cursor` /
 * `prev_cursor` the seek positions of the neighbouring pages). Returned as a
 * plain object so the caller's `reply.send(...)` is still checked against the
 * route's zod response schema.
 */
export const paginatedResponse = <T>({
	query,
	nextCursor,
	prevCursor,
	rows,
	message,
}: PageInput<T>) => ({
	code: HTTP_RESPONSE_CODE.OK.code,
	message,
	limit: query.limit,
	total: rows.length,
	next_cursor: nextCursor,
	prev_cursor: prevCursor,
	data: rows,
});
