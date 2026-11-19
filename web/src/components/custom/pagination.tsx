import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsLeftIcon,
	ChevronsRightIcon,
} from "lucide-react";

import {
	LAST_PAGE_CURSOR,
	PAGE_SIZE_OPTIONS,
} from "@transaction-dispute-portal/shared";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface PaginationProps {
	/** The `?cursor=` the current page was reached by — unset on the first page. */
	cursor: string | undefined;
	/** The envelope's `next_cursor` / `prev_cursor` — `null` where there is no page that way. */
	nextCursor: string | null;
	prevCursor: string | null;
	/** How many rows the current page holds. */
	shown: number;
	/** Rows per page — the route's `?limit=`. */
	limit: number;
	/** Move to the page `cursor` points at — `undefined` for the first page. */
	onCursorChange: (cursor: string | undefined) => void;
	onLimitChange: (limit: number) => void;
}

/**
 * Pager driven by the envelope's cursors: first / prev / next / last, every
 * one an index seek, so each page costs the same however deep it is. No page
 * numbers and no total — the list is never counted. A page left empty by a
 * stale cursor (its rows deleted since) keeps First and Last open so the
 * reader can get back. The page-size picker keeps the cursor: a seek page
 * starts at the same row whatever its size, so it just shows more or fewer
 * rows from there. A hand-typed `?limit=` that isn't one of the steps is
 * still shown as the current choice.
 */
export const Pagination = ({
	cursor,
	nextCursor,
	prevCursor,
	shown,
	limit,
	onCursorChange,
	onLimitChange,
}: PaginationProps) => {
	const stranded = shown === 0 && cursor !== undefined;
	const atStart = prevCursor === null && !stranded;
	const atEnd = nextCursor === null && !stranded;

	const sizes = [...new Set<number>([...PAGE_SIZE_OPTIONS, limit])].sort(
		(a, b) => a - b,
	);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<label className="text-muted-foreground flex items-center gap-2">
				Rows per page
				<Select
					value={limit}
					onChange={(event) => onLimitChange(Number(event.target.value))}
					className="h-8 w-20"
				>
					{sizes.map((size) => (
						<option key={size} value={size}>
							{size}
						</option>
					))}
				</Select>
			</label>

			<div className="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={atStart}
					onClick={() => onCursorChange(undefined)}
					aria-label="First page"
				>
					<ChevronsLeftIcon />
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={prevCursor === null}
					onClick={() => onCursorChange(prevCursor ?? undefined)}
				>
					<ChevronLeftIcon />
					Prev
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={nextCursor === null}
					onClick={() => onCursorChange(nextCursor ?? undefined)}
				>
					Next
					<ChevronRightIcon />
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={atEnd}
					onClick={() => onCursorChange(LAST_PAGE_CURSOR)}
					aria-label="Last page"
				>
					<ChevronsRightIcon />
				</Button>
			</div>
		</div>
	);
};
