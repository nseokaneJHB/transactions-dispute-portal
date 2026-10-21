import { useState } from "react";
import { useForm } from "react-hook-form";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import { TextField } from "@/components/custom/text-field";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { formatZar, humanize } from "@/lib/format";
import {
	AMOUNT_SLIDER_MAX_CENTS,
	AMOUNT_SLIDER_STEP_CENTS,
	amountBoundsToSlider,
	sliderToAmountBounds,
} from "@/lib/list-query";
import { cn } from "@/lib/utils";

/** The filter fields every list shares — the wire keys, all optional. */
export interface ListFilters<TStatus extends string = string> {
	search?: string;
	from?: string;
	to?: string;
	status?: TStatus;
	min_amount_cents?: number;
	max_amount_cents?: number;
}

interface ListControlsProps<TStatus extends string> {
	/** Current search-param values, to seed the forms. */
	values: ListFilters<TStatus>;
	searchPlaceholder: string;
	statusLabel?: string;
	/** When given, the filters modal renders status pills for these values (plus "All"). */
	statusOptions?: readonly TStatus[];
	/** Renders the amount range slider (sent as `min_amount_cents` / `max_amount_cents`). */
	showAmountRange?: boolean;
	/** Apply a filter patch — merged into the route search, resetting to page 1. */
	onApply: (filters: ListFilters<TStatus>) => void;
	/** Drop every filter. */
	onClear: () => void;
	/** Whether any filter (incl. search and sort) is set — "Clear" only renders when it is. */
	clearable: boolean;
}

interface FilterState {
	from: string;
	to: string;
	status: string;
	amount: [number, number];
}

const EMPTY_FILTERS: FilterState = {
	from: "",
	to: "",
	status: "",
	amount: amountBoundsToSlider(undefined, undefined),
};

/** How many filter groups (status, date range, amount range) are active — the badge on the "Filters" button. */
const countActiveFilters = (values: ListFilters): number =>
	[
		values.status,
		values.from ?? values.to,
		values.min_amount_cents ?? values.max_amount_cents,
	].filter((value) => value !== undefined && value !== "").length;

/**
 * The filter bar shared by every list page: a search box, a "Filters" button
 * opening a modal for status / date range / amount range, and a "Clear" that
 * appears once anything is filtered.
 * Sorting is not here — it is driven by the sortable column headers
 * (`SortableHeader`). Search applies on submit; the modal applies on "Apply".
 */
export const ListControls = <TStatus extends string = string>({
	values,
	searchPlaceholder,
	statusLabel = "Status",
	statusOptions,
	showAmountRange = false,
	onApply,
	onClear,
	clearable,
}: ListControlsProps<TStatus>) => {
	const [filtersOpen, setFiltersOpen] = useState(false);

	const searchForm = useForm<{ search: string }>({
		values: { search: values.search ?? "" },
	});

	const toFilterState = (): FilterState => ({
		from: values.from ?? "",
		to: values.to ?? "",
		status: values.status ?? "",
		amount: amountBoundsToSlider(
			values.min_amount_cents,
			values.max_amount_cents,
		),
	});
	const [filters, setFilters] = useState<FilterState>(toFilterState);
	const patchFilters = (patch: Partial<FilterState>) =>
		setFilters((current) => ({ ...current, ...patch }));

	const activeCount = countActiveFilters(values);

	const submitSearch = ({ search }: { search: string }) =>
		onApply({ search: search.trim() || undefined });

	const applyFilters = () => {
		onApply({
			from: filters.from || undefined,
			to: filters.to || undefined,
			...(statusOptions
				? { status: (filters.status || undefined) as TStatus | undefined }
				: {}),
			...(showAmountRange ? sliderToAmountBounds(filters.amount) : {}),
		});
		setFiltersOpen(false);
	};

	const openFilters = (open: boolean) => {
		if (open) setFilters(toFilterState());
		setFiltersOpen(open);
	};

	const clear = () => {
		searchForm.reset({ search: "" });
		setFilters(EMPTY_FILTERS);
		onClear();
	};

	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
			<form
				role="search"
				className="flex flex-1 gap-2"
				onSubmit={searchForm.handleSubmit(submitSearch)}
			>
				<div className="flex-1">
					<TextField
						id="search"
						type="search"
						aria-label="Search"
						placeholder={searchPlaceholder}
						{...searchForm.register("search")}
					/>
				</div>
				<Button type="submit" variant="primary" size="icon" aria-label="Search">
					<SearchIcon />
				</Button>
			</form>

			<div className="flex gap-2">
				<Dialog open={filtersOpen} onOpenChange={openFilters}>
					<DialogTrigger asChild>
						<Button
							type="button"
							variant="secondary"
							className="flex-1 sm:flex-none"
						>
							<SlidersHorizontalIcon />
							Filters
							{activeCount > 0 && (
								<span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs leading-5 tabular-nums">
									{activeCount}
								</span>
							)}
						</Button>
					</DialogTrigger>
					<DialogContent className="space-y-4">
						<DialogHeader>
							<DialogTitle>Filters</DialogTitle>
							<DialogDescription>
								Narrow the list, then apply.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-5">
							{statusOptions && (
								<fieldset className="flex flex-col gap-2">
									<legend className="mb-2 text-sm font-medium">
										{statusLabel}
									</legend>
									<div className="flex flex-wrap gap-2">
										{["", ...statusOptions].map((value) => (
											<button
												key={value || "all"}
												type="button"
												aria-pressed={filters.status === value}
												onClick={() => patchFilters({ status: value })}
												className={cn(
													"focus-visible:ring-ring rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2",
													filters.status === value
														? "bg-primary text-primary-foreground border-primary"
														: "bg-card hover:bg-muted",
												)}
											>
												{value ? humanize(value) : "All"}
											</button>
										))}
									</div>
								</fieldset>
							)}
							<div className="grid grid-cols-2 gap-3">
								<TextField
									id="from"
									type="date"
									label="From"
									value={filters.from}
									onChange={(event) =>
										patchFilters({ from: event.target.value })
									}
								/>
								<TextField
									id="to"
									type="date"
									label="To"
									value={filters.to}
									onChange={(event) => patchFilters({ to: event.target.value })}
								/>
							</div>
							{showAmountRange && (
								<div className="flex flex-col gap-3">
									<div className="flex items-baseline justify-between text-sm">
										<span className="font-medium">Amount</span>
										<span className="text-muted-foreground tabular-nums">
											{formatZar(filters.amount[0])} –{" "}
											{formatZar(filters.amount[1])}
											{filters.amount[1] === AMOUNT_SLIDER_MAX_CENTS && "+"}
										</span>
									</div>
									<Slider
										aria-label="Amount range"
										min={0}
										max={AMOUNT_SLIDER_MAX_CENTS}
										step={AMOUNT_SLIDER_STEP_CENTS}
										minStepsBetweenThumbs={1}
										value={filters.amount}
										onValueChange={(amount) =>
											patchFilters({ amount: amount as [number, number] })
										}
									/>
								</div>
							)}
							<div className="flex justify-end gap-2 pt-2">
								<Button
									type="button"
									variant="secondary"
									onClick={() => setFilters(EMPTY_FILTERS)}
								>
									Reset
								</Button>
								<Button type="button" variant="primary" onClick={applyFilters}>
									Apply filters
								</Button>
							</div>
						</div>
					</DialogContent>
				</Dialog>

				{clearable && (
					<Button
						type="button"
						variant="ghost"
						className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive border"
						onClick={clear}
					>
						<XIcon />
						Clear
					</Button>
				)}
			</div>
		</div>
	);
};
