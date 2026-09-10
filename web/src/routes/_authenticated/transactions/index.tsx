import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import {
	TRANSACTION_SORT,
	transactionsQuerySchema,
} from "@transaction-dispute-portal/shared";

import { transactionsRequest } from "@/api/transaction";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { DataList } from "@/components/custom/data-list";
import { Button } from "@/components/ui/button";
import { formatDate, formatZar } from "@/lib/format";

const TransactionsPage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const result = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Transactions"
				description="Every payment on your account. Open one to raise a dispute."
			/>

			<DataList
				result={result}
				search={search}
				onSearchChange={(next) => navigate({ search: next })}
				searchPlaceholder="Merchant name"
				emptyState={{
					title: "No transactions match",
					description: "Try widening the date range or clearing the filters.",
				}}
				columns={[
					{
						header: "Date",
						sortKey: TRANSACTION_SORT.transacted_at,
						cellClassName: "text-muted-foreground whitespace-nowrap",
						cell: (transaction) => formatDate(transaction.transacted_at),
					},
					{
						header: "Merchant",
						sortKey: TRANSACTION_SORT.merchant,
						cellClassName: "font-medium",
						cell: (transaction) => transaction.merchant_name,
					},
					{
						header: "Amount",
						sortKey: TRANSACTION_SORT.amount_cents,
						align: "right",
						cellClassName: "text-right tabular-nums",
						cell: (transaction) => formatZar(transaction.amount_cents),
					},
					{
						header: "",
						cellClassName: "text-right",
						cell: (transaction) => (
							<Button asChild variant="secondary" size="sm">
								<Link
									to="/transactions/$transactionId"
									params={{ transactionId: transaction.id }}
								>
									View
									<ChevronRightIcon />
								</Link>
							</Button>
						),
					},
				]}
			/>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/transactions/")({
	component: TransactionsPage,
	validateSearch: transactionsQuerySchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.TRANSACTIONS, deps],
			queryFn: () => transactionsRequest({ data: deps }),
		}),
});
