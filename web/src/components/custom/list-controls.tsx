import { useForm } from "react-hook-form";
import { SearchIcon } from "lucide-react";

import { SelectField, TextField } from "@/components/custom/text-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";

/** The filter fields every list shares — the wire keys, all optional. */
export interface ListFilters<TStatus extends string = string> {
	search?: string;
	from?: string;
	to?: string;
	status?: TStatus;
}

interface ListControlsProps<TStatus extends string> {
	/** Current search-param values, to seed the form. */
	values: ListFilters<TStatus>;
	searchPlaceholder: string;
	statusLabel?: string;
	/** When given, renders a status `<select>` with these values (plus "all"). */
	statusOptions?: readonly TStatus[];
	/** Apply the typed filters — merge the patch into the route search, resetting to page 1. */
	onApply: (filters: ListFilters<TStatus>) => void;
	/** Drop every filter. Disabled unless `clearable`. */
	onClear: () => void;
	/** Whether any filter (incl. sort) is currently set — enables "Clear". */
	clearable: boolean;
}

interface FormValues {
	search: string;
	from: string;
	to: string;
	status: string;
}

/**
 * The text-search + date-range (+ optional status) filter bar shared by every
 * list page. Sorting is not here — it is driven by the sortable column headers
 * (`SortableHeader`). Filters apply on submit, not keystroke.
 */
export const ListControls = <TStatus extends string = string>({
	values,
	searchPlaceholder,
	statusLabel = "Status",
	statusOptions,
	onApply,
	onClear,
	clearable,
}: ListControlsProps<TStatus>) => {
	const { register, handleSubmit, reset } = useForm<FormValues>({
		values: {
			search: values.search ?? "",
			from: values.from ?? "",
			to: values.to ?? "",
			status: values.status ?? "",
		},
	});

	const submit = (form: FormValues) =>
		onApply({
			search: form.search.trim() || undefined,
			from: form.from || undefined,
			to: form.to || undefined,
			...(statusOptions
				? { status: (form.status || undefined) as TStatus | undefined }
				: {}),
		});

	const clear = () => {
		reset({ search: "", from: "", to: "", status: "" });
		onClear();
	};

	return (
		<form
			className={cn(
				"grid grid-cols-1 gap-3 sm:items-end",
				statusOptions
					? "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
					: "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
			)}
			onSubmit={handleSubmit(submit)}
		>
			<TextField
				id="search"
				type="search"
				label="Search"
				placeholder={searchPlaceholder}
				{...register("search")}
			/>
			{statusOptions && (
				<SelectField id="status" label={statusLabel} {...register("status")}>
					<option value="">All</option>
					{statusOptions.map((value) => (
						<option key={value} value={value}>
							{humanize(value)}
						</option>
					))}
				</SelectField>
			)}
			<TextField id="from" type="date" label="From" {...register("from")} />
			<TextField id="to" type="date" label="To" {...register("to")} />
			<div className="flex gap-2">
				<Button type="submit" variant="primary" className="flex-1 sm:flex-none">
					<SearchIcon />
					Apply
				</Button>
				<Button
					type="button"
					variant="destructive"
					className="flex-1 sm:flex-none"
					disabled={!clearable}
					onClick={clear}
				>
					Clear
				</Button>
			</div>
		</form>
	);
};
