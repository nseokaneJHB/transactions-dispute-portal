import { useForm } from "react-hook-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ChevronRightIcon } from "lucide-react";

import {
	ORDER_DIRECTION,
	DEFAULT_PAGE_LIMIT,
} from "@transaction-dispute-portal/shared";

import { transactionsRequest } from "@/api/transaction";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { Pagination } from "@/components/custom/pagination";
import { EmptyState } from "@/components/custom/empty-state";
import { SelectField, TextField } from "@/components/custom/text-field";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDate, formatZar } from "@/lib/format";

const searchSchema = z.object({
	page: z.coerce.number().int().positive().optional(),
	from: z.string().optional(),
	to: z.string().optional(),
	order: z.enum(ORDER_DIRECTION).optional(),
});

type TransactionSearch = z.infer<typeof searchSchema>;

const Filters = ({ search }: { search: TransactionSearch }) => {
	const navigate = Route.useNavigate();
	const { register, handleSubmit } = useForm<TransactionSearch>({
		values: {
			order: search.order ?? ORDER_DIRECTION.desc,
			from: search.from,
			to: search.to,
		},
	});

	const apply = (values: TransactionSearch) =>
		navigate({
			search: {
				page: 1,
				order: values.order,
				from: values.from || undefined,
				to: values.to || undefined,
			},
		});

	return (
		<form
			className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
			onSubmit={handleSubmit(apply)}
		>
			<TextField id="from" type="date" label="From" {...register("from")} />
			<TextField id="to" type="date" label="To" {...register("to")} />
			<SelectField id="order" label="Order" {...register("order")}>
				<option value={ORDER_DIRECTION.desc}>Newest first</option>
				<option value={ORDER_DIRECTION.asc}>Oldest first</option>
			</SelectField>
			<div className="flex gap-2">
				<Button type="submit" variant="secondary">
					Apply
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() =>
						navigate({ search: { page: 1, order: ORDER_DIRECTION.desc } })
					}
				>
					Clear
				</Button>
			</div>
		</form>
	);
};

const TransactionsPage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, page, count, limit } = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Transactions"
				description="Every payment on your account. Open one to raise a dispute."
			/>

			<Filters search={search} />

			{data.length === 0 ? (
				<EmptyState
					title="No transactions match"
					description="Try widening the date range or clearing the filters."
				/>
			) : (
				<Table>
					<TableHead>
						<tr>
							<TableHeaderCell>Date</TableHeaderCell>
							<TableHeaderCell>Merchant</TableHeaderCell>
							<TableHeaderCell className="text-right">Amount</TableHeaderCell>
							<TableHeaderCell />
						</tr>
					</TableHead>
					<TableBody>
						{data.map((transaction) => (
							<TableRow key={transaction.id}>
								<TableCell className="text-muted-foreground whitespace-nowrap">
									{formatDate(transaction.transacted_at)}
								</TableCell>
								<TableCell className="font-medium">
									{transaction.merchant_name}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatZar(transaction.amount_cents)}
								</TableCell>
								<TableCell className="text-right">
									<Button asChild variant="ghost" size="sm">
										<Link
											to="/transactions/$transactionId"
											params={{ transactionId: transaction.id }}
										>
											View
											<ChevronRightIcon />
										</Link>
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<Pagination
				page={page}
				limit={limit}
				count={count}
				onPageChange={(next) => navigate({ search: { ...search, page: next } })}
			/>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/transactions/")({
	component: TransactionsPage,
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.TRANSACTIONS, deps],
			queryFn: () =>
				transactionsRequest({ data: { ...deps, limit: DEFAULT_PAGE_LIMIT } }),
		}),
});
