import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon, ScaleIcon } from "lucide-react";

import {
	DISPUTE_SORT,
	DISPUTE_STATUS,
	disputesQuerySchema,
} from "@transaction-dispute-portal/shared";

import { disputesRequest } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { DataList } from "@/components/custom/data-list";
import { StatusBadge } from "@/components/custom/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatZar, humanize } from "@/lib/format";

const DisputesPage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const result = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Your disputes"
				description="A record of every dispute you've raised and where it stands."
			/>

			<DataList
				result={result}
				search={search}
				onSearchChange={(next) => navigate({ search: next })}
				searchPlaceholder="Merchant or description"
				statusOptions={Object.values(DISPUTE_STATUS)}
				emptyState={{
					icon: ScaleIcon,
					title: "No disputes match",
					description: "When you dispute a transaction it will show up here.",
					action: (
						<Button asChild variant="secondary">
							<Link to="/transactions">Go to transactions</Link>
						</Button>
					),
				}}
				columns={[
					{
						header: "Merchant",
						sortKey: DISPUTE_SORT.merchant,
						cellClassName: "font-medium",
						cell: (dispute) => dispute.transaction.merchant_name,
					},
					{
						header: "Amount",
						sortKey: DISPUTE_SORT.amount_cents,
						align: "right",
						cellClassName: "text-right tabular-nums",
						cell: (dispute) => formatZar(dispute.transaction.amount_cents),
					},
					{
						header: "Reason",
						cellClassName: "font-medium",
						cell: (dispute) => humanize(dispute.reason),
					},
					{
						header: "Opened",
						sortKey: DISPUTE_SORT.created_at,
						cellClassName: "text-muted-foreground whitespace-nowrap",
						cell: (dispute) => formatDate(dispute.created_at),
					},
					{
						header: "Status",
						sortKey: DISPUTE_SORT.status,
						cell: (dispute) => <StatusBadge status={dispute.status} />,
					},
					{
						header: "",
						cellClassName: "text-right",
						cell: (dispute) => (
							<Button asChild variant="secondary" size="sm">
								<Link
									to="/disputes/$disputeId"
									params={{ disputeId: dispute.id }}
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

export const Route = createFileRoute("/_authenticated/disputes/")({
	component: DisputesPage,
	validateSearch: disputesQuerySchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.DISPUTES, deps],
			queryFn: () => disputesRequest({ data: deps }),
		}),
});
