import { ORDER_DIRECTION } from "@transaction-dispute-portal/shared";
import type { OrderDirection } from "@transaction-dispute-portal/shared";

/**
 * The `sort` / `order` a list should move to when a sortable column header is
 * clicked, cycling through three states: a new column sorts descending, a
 * second click flips to ascending, a third click clears the sort entirely
 * (both `undefined`) — the reader has decided they don't want to sort by it.
 */
export const nextSort = <TColumn extends string>(
	current: { sort?: string; order?: OrderDirection },
	column: TColumn,
): { sort: TColumn | undefined; order: OrderDirection | undefined } => {
	if (current.sort !== column) {
		return { sort: column, order: ORDER_DIRECTION.desc };
	}
	if (current.order === ORDER_DIRECTION.asc) {
		return { sort: undefined, order: undefined };
	}
	return { sort: column, order: ORDER_DIRECTION.asc };
};

/** The optional search-param keys a "Clear" wipes and `hasActiveFilters` checks. */
const FILTER_KEYS = ["search", "from", "to", "status", "sort", "order"] as const;

/**
 * The search-param patch that resets every optional list filter — spread into a
 * navigate updater (`{ ...prev, ...CLEARED_FILTERS }`) to drop search, dates,
 * status and sort in one go while keeping `page` / `limit`.
 */
export const CLEARED_FILTERS = {
	page: 1,
	search: undefined,
	from: undefined,
	to: undefined,
	status: undefined,
	sort: undefined,
	order: undefined,
} as const;

/** Whether the current route search carries any filter worth a "Clear" button. */
export const hasActiveFilters = (
	search: Partial<Record<(typeof FILTER_KEYS)[number], unknown>>,
): boolean =>
	FILTER_KEYS.some((key) => {
		const value = search[key];
		return value !== undefined && value !== "";
	});
