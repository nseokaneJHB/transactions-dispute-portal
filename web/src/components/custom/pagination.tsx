import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
	page: number;
	limit: number;
	count: number;
	onPageChange: (page: number) => void;
}

/** Prev / next pager driven by the envelope's `count` (total matches) and `limit`. */
export const Pagination = ({
	page,
	limit,
	count,
	onPageChange,
}: PaginationProps) => {
	const totalPages = Math.max(1, Math.ceil(count / limit));
	const from = count === 0 ? 0 : (page - 1) * limit + 1;
	const to = Math.min(page * limit, count);

	return (
		<div className="flex items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				{count === 0 ? "No results" : `${from}–${to} of ${count}`}
			</p>
			<div className="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					<ChevronLeftIcon />
					Prev
				</Button>
				<span className="text-muted-foreground tabular-nums">
					{page} / {totalPages}
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
			</div>
		</div>
	);
};
