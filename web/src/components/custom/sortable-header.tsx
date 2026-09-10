import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { ORDER_DIRECTION } from "@transaction-dispute-portal/shared";
import type { OrderDirection } from "@transaction-dispute-portal/shared";

import { TableHeaderCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableHeaderProps<TColumn extends string> {
	/** The `?sort=` value this column maps to — must be on the endpoint's whitelist. */
	column: TColumn;
	label: string;
	sort: string | undefined;
	order: OrderDirection | undefined;
	onSort: (column: TColumn) => void;
	align?: "left" | "right";
	className?: string;
}

/**
 * A table header cell that sorts the list by its column on click, toggling
 * direction when it is already the active column. The icon shows the current
 * state: neutral when another column is active, an arrow otherwise.
 */
export const SortableHeader = <TColumn extends string>({
	column,
	label,
	sort,
	order,
	onSort,
	align = "left",
	className,
}: SortableHeaderProps<TColumn>) => {
	const active = sort === column;
	const ascending = active && order === ORDER_DIRECTION.asc;
	const Icon = !active
		? ChevronsUpDownIcon
		: ascending
			? ArrowUpIcon
			: ArrowDownIcon;

	return (
		<TableHeaderCell className={cn("p-0", className)}>
			<button
				type="button"
				onClick={() => onSort(column)}
				aria-label={`Sort by ${label}`}
				aria-sort={
					!active ? "none" : ascending ? "ascending" : "descending"
				}
				className={cn(
					"hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-1.5 px-4 py-2.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
					align === "right" && "justify-end",
				)}
			>
				{label}
				<Icon
					className={cn("size-3.5 shrink-0", !active && "text-muted-foreground/60")}
				/>
			</button>
		</TableHeaderCell>
	);
};
