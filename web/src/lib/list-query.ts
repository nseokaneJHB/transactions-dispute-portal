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
const FILTER_KEYS = [
	"search",
	"from",
	"to",
	"status",
	"min_amount_cents",
	"max_amount_cents",
	"sort",
	"order",
] as const;

/**
 * The search-param patch that resets every optional list filter — spread into a
 * navigate updater (`{ ...prev, ...CLEARED_FILTERS }`) to drop search, dates,
 * status and sort in one go while keeping `limit`.
 */
export const CLEARED_FILTERS = {
	cursor: undefined,
	search: undefined,
	from: undefined,
	to: undefined,
	status: undefined,
	min_amount_cents: undefined,
	max_amount_cents: undefined,
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

/** The amount slider's top end and step, in ZAR cents. The top end means "no upper limit". */
export const AMOUNT_SLIDER_MAX_CENTS = 2_500_000;
export const AMOUNT_SLIDER_STEP_CENTS = 5_000;

/** The `[min, max]` slider position for the current amount bounds — unset bounds sit at the ends. */
export const amountBoundsToSlider = (
	min: number | undefined,
	max: number | undefined,
): [number, number] => [
	Math.min(min ?? 0, AMOUNT_SLIDER_MAX_CENTS),
	Math.min(max ?? AMOUNT_SLIDER_MAX_CENTS, AMOUNT_SLIDER_MAX_CENTS),
];

/** The amount bounds a slider position sends — a thumb at its end means that side is unbounded. */
export const sliderToAmountBounds = ([min, max]: [number, number]): {
	min_amount_cents: number | undefined;
	max_amount_cents: number | undefined;
} => ({
	min_amount_cents: min > 0 ? min : undefined,
	max_amount_cents: max < AMOUNT_SLIDER_MAX_CENTS ? max : undefined,
});
