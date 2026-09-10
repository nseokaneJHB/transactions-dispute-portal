import type { ComponentType, ReactNode } from "react";

import type { OrderDirection } from "@transaction-dispute-portal/shared";

import { EmptyState } from "@/components/custom/empty-state";
import { ListControls, type ListFilters } from "@/components/custom/list-controls";
import { Pagination } from "@/components/custom/pagination";
import { SortableHeader } from "@/components/custom/sortable-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/components/ui/table";
import { CLEARED_FILTERS, hasActiveFilters, nextSort } from "@/lib/list-query";
import { cn } from "@/lib/utils";

/** The search-param shape every list route shares — pagination, filters, sort. */
export interface ListSearch<
	TStatus extends string = string,
	TSort extends string = string,
> {
	page: number;
	limit: number;
	search?: string;
	from?: string;
	to?: string;
	status?: TStatus;
	sort?: TSort;
	order?: OrderDirection;
}

/** One table column: a header (optionally sortable) and how to render its cell. */
export interface DataListColumn<TRow, TSort extends string> {
	header: string;
	cell: (row: TRow) => ReactNode;
	/** When set, the header sorts the list by this whitelisted `?sort=` value. */
	sortKey?: TSort;
	align?: "left" | "right";
	/** Extra classes for every body cell in this column (alignment, muting, nums). */
	cellClassName?: string;
}

interface DataListProps<
	TRow extends { id: string },
	TStatus extends string,
	TSort extends string,
> {
	result: { data: TRow[]; page: number; limit: number; count: number };
	search: ListSearch<TStatus, TSort>;
	/** Write the next search params back to the route. */
	onSearchChange: (next: ListSearch<TStatus, TSort>) => void;
	columns: DataListColumn<TRow, TSort>[];
	searchPlaceholder: string;
	/** When given, `ListControls` renders a status `<select>` with these values. */
	statusOptions?: readonly TStatus[];
	emptyState: {
		title: string;
		description?: string;
		icon?: ComponentType<{ className?: string }>;
		action?: ReactNode;
	};
}

/**
 * The list surface shared by every paginated table page: a filter bar, a
 * sortable table, and a pager, all driven by the route's search params. A page
 * supplies its columns, its filter/empty copy, and an `onSearchChange` that
 * persists the next params; apply, clear, sort cycling and paging live here.
 */
export const DataList = <
	TRow extends { id: string },
	TStatus extends string = string,
	TSort extends string = string,
>({
	result,
	search,
	onSearchChange,
	columns,
	searchPlaceholder,
	statusOptions,
	emptyState,
}: DataListProps<TRow, TStatus, TSort>) => {
	const { data, page, limit, count } = result;

	const applyFilters = (filters: ListFilters<TStatus>) =>
		onSearchChange({ ...search, page: 1, ...filters });

	const sortBy = (column: TSort) =>
		onSearchChange({ ...search, page: 1, ...nextSort(search, column) });

	return (
		<div className="flex flex-col gap-5">
			<ListControls
				values={search}
				searchPlaceholder={searchPlaceholder}
				statusOptions={statusOptions}
				clearable={hasActiveFilters(search)}
				onApply={applyFilters}
				onClear={() => onSearchChange({ ...search, ...CLEARED_FILTERS })}
			/>

			{data.length === 0 ? (
				<EmptyState {...emptyState} />
			) : (
				<Table>
					<TableHead>
						<tr>
							{columns.map((column, index) =>
								column.sortKey ? (
									<SortableHeader
										key={column.sortKey}
										column={column.sortKey}
										label={column.header}
										align={column.align}
										sort={search.sort}
										order={search.order}
										onSort={sortBy}
									/>
								) : (
									<TableHeaderCell
										key={index}
										className={cn(column.align === "right" && "text-right")}
									>
										{column.header}
									</TableHeaderCell>
								),
							)}
						</tr>
					</TableHead>
					<TableBody>
						{data.map((row) => (
							<TableRow key={row.id}>
								{columns.map((column, index) => (
									<TableCell key={index} className={column.cellClassName}>
										{column.cell(row)}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<Pagination
				page={page}
				limit={limit}
				count={count}
				onPageChange={(next) => onSearchChange({ ...search, page: next })}
			/>
		</div>
	);
};
