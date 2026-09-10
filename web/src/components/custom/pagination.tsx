import { useEffect, useRef, useState } from "react";

import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronsLeftIcon,
	ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaginationProps {
	page: number;
	limit: number;
	count: number;
	onPageChange: (page: number) => void;
}

/**
 * Pager driven by the envelope's `count` (total matches) and `limit`: first /
 * prev / next / last jumps, plus a page-number box to go straight to any page.
 */
export const Pagination = ({
	page,
	limit,
	count,
	onPageChange,
}: PaginationProps) => {
	const totalPages = Math.max(1, Math.ceil(count / limit));
	const from = count === 0 ? 0 : (page - 1) * limit + 1;
	const to = Math.min(page * limit, count);

	const [draft, setDraft] = useState(String(page));

	/** `onPageChange` is a fresh arrow each render — read it through a ref so the debounce effect doesn't re-arm. */
	const onPageChangeRef = useRef(onPageChange);
	onPageChangeRef.current = onPageChange;

	/** Re-sync the box whenever the page moves from a button (or elsewhere). */
	useEffect(() => setDraft(String(page)), [page]);

	const parsedDraft = Number(draft);
	const draftIsValidPage =
		Number.isInteger(parsedDraft) &&
		parsedDraft >= 1 &&
		parsedDraft <= totalPages;

	/** Commit a valid page a short beat after typing stops — no Enter needed. */
	useEffect(() => {
		if (!draftIsValidPage || parsedDraft === page) return;
		const timer = setTimeout(() => onPageChangeRef.current(parsedDraft), 600);
		return () => clearTimeout(timer);
	}, [draftIsValidPage, parsedDraft, page]);

	const goToDraft = () => {
		if (!draftIsValidPage) {
			setDraft(String(page));
			return;
		}
		if (parsedDraft !== page) onPageChange(parsedDraft);
	};

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				{count === 0 ? "No results" : `${from}–${to} of ${count}`}
			</p>

			<div className="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={page <= 1}
					onClick={() => onPageChange(1)}
					aria-label="First page"
				>
					<ChevronsLeftIcon />
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					<ChevronLeftIcon />
					Prev
				</Button>

				<span className="text-muted-foreground flex items-center gap-1.5 tabular-nums">
					<Input
						type="number"
						min={1}
						max={totalPages}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={goToDraft}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								goToDraft();
							}
						}}
						aria-label="Page number"
						className="h-8 w-14 px-2 text-center"
					/>
					/ {totalPages}
				</span>

				<Button
					variant="secondary"
					size="sm"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
				>
					Next
					<ChevronRightIcon />
				</Button>
				<Button
					variant="secondary"
					size="sm"
					disabled={page >= totalPages}
					onClick={() => onPageChange(totalPages)}
					aria-label="Last page"
				>
					<ChevronsRightIcon />
				</Button>
			</div>
		</div>
	);
};
