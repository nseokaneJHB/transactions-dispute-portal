import { createFileRoute } from "@tanstack/react-router";

import {
	ADMIN_DISPUTE_SORT,
	DISPUTE_STATUS,
	adminDisputesQuerySchema,
	type DisputeStatus,
} from "@transaction-dispute-portal/shared";

import { adminDisputeSummaryRequest, adminDisputesRequest } from "@/api/admin";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { DataList } from "@/components/custom/data-list";
import { DisputeSummaryCards } from "@/components/custom/dispute-summary-cards";
import { StatusBadge } from "@/components/custom/status-badge";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { formatDate, formatZar, humanize } from "@/lib/format";

const ReviewQueuePage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { list, summary } = Route.useLoaderData();

	const filterByStatus = (status: DisputeStatus | undefined) =>
		navigate({ search: (prev) => ({ ...prev, page: 1, status }) });

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Review queue"
				description="Every customer dispute. Move submitted disputes into review, then resolve or reject them."
			/>

			<DisputeSummaryCards
				counts={summary.data}
				activeStatus={search.status}
				onSelect={filterByStatus}
			/>

			<DataList
				result={list}
				search={search}
				onSearchChange={(next) => navigate({ search: next })}
				searchPlaceholder="Customer, merchant or description"
				statusOptions={Object.values(DISPUTE_STATUS)}
				emptyState={{ title: "Nothing matches" }}
				columns={[
					{
						header: "Customer",
						sortKey: ADMIN_DISPUTE_SORT.customer,
						cell: (dispute) => (
							<>
								<span className="font-medium">{dispute.customer.name}</span>
								<span className="text-muted-foreground block text-xs">
									{dispute.customer.email}
								</span>
							</>
						),
					},
					{
						header: "Merchant",
						sortKey: ADMIN_DISPUTE_SORT.merchant,
						cellClassName: "font-medium",
						cell: (dispute) => dispute.transaction.merchant_name,
					},
					{
						header: "Amount",
						sortKey: ADMIN_DISPUTE_SORT.amount_cents,
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
						sortKey: ADMIN_DISPUTE_SORT.created_at,
						cellClassName: "text-muted-foreground whitespace-nowrap",
						cell: (dispute) => formatDate(dispute.created_at),
					},
					{
						header: "Status",
						sortKey: ADMIN_DISPUTE_SORT.status,
						cell: (dispute) => <StatusBadge status={dispute.status} />,
					},
					{
						header: "",
						cellClassName: "text-right",
						cell: (dispute) => <DisputeActions dispute={dispute} />,
					},
				]}
			/>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/admin/")({
	component: ReviewQueuePage,
	validateSearch: adminDisputesQuerySchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const [list, summary] = await Promise.all([
			context.queryClient.ensureQueryData({
				queryKey: [...QUERY_KEYS.ADMIN_DISPUTES, deps],
				queryFn: () => adminDisputesRequest({ data: deps }),
			}),
			context.queryClient.ensureQueryData({
				queryKey: QUERY_KEYS.ADMIN_DISPUTE_SUMMARY,
				queryFn: () => adminDisputeSummaryRequest(),
			}),
		]);
		return { list, summary };
	},
});
