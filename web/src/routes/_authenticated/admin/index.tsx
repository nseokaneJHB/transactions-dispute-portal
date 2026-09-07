import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
	DISPUTE_STATUS,
	DEFAULT_PAGE_LIMIT,
} from "@transaction-dispute-portal/shared";

import { adminDisputesRequest } from "@/api/admin";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { Pagination } from "@/components/custom/pagination";
import { EmptyState } from "@/components/custom/empty-state";
import { StatusBadge } from "@/components/custom/status-badge";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { Select } from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/components/ui/table";
import { formatDate, formatZar, humanize } from "@/lib/format";

const searchSchema = z.object({
	page: z.coerce.number().int().positive().optional(),
	status: z.enum(DISPUTE_STATUS).optional(),
});

const ReviewQueuePage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, page, count, limit } = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Review queue"
				description="Every customer dispute. Move submitted disputes into review, then resolve or reject them."
			/>

			<div className="flex items-center gap-3">
				<label htmlFor="status" className="text-sm font-medium">
					Status
				</label>
				<Select
					id="status"
					className="max-w-56"
					value={search.status ?? ""}
					onChange={(event) =>
						navigate({
							search: {
								page: 1,
								status:
									(event.target.value as keyof typeof DISPUTE_STATUS) ||
									undefined,
							},
						})
					}
				>
					<option value="">All statuses</option>
					{Object.values(DISPUTE_STATUS).map((value) => (
						<option key={value} value={value}>
							{humanize(value)}
						</option>
					))}
				</Select>
			</div>

			{data.length === 0 ? (
				<EmptyState title="Nothing in the queue" />
			) : (
				<Table>
					<TableHead>
						<tr>
							<TableHeaderCell>Opened</TableHeaderCell>
							<TableHeaderCell>Transaction</TableHeaderCell>
							<TableHeaderCell>Reason</TableHeaderCell>
							<TableHeaderCell>Status</TableHeaderCell>
							<TableHeaderCell />
						</tr>
					</TableHead>
					<TableBody>
						{data.map((dispute) => (
							<TableRow key={dispute.id}>
								<TableCell className="text-muted-foreground whitespace-nowrap">
									{formatDate(dispute.created_at)}
								</TableCell>
								<TableCell>
									<span className="font-medium">
										{dispute.transaction.merchant_name}
									</span>
									<span className="text-muted-foreground">
										{" "}
										{formatZar(dispute.transaction.amount_cents)}
									</span>
								</TableCell>
								<TableCell className="font-medium">
									{humanize(dispute.reason)}
								</TableCell>
								<TableCell>
									<StatusBadge status={dispute.status} />
								</TableCell>
								<TableCell className="text-right">
									<DisputeActions dispute={dispute} />
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

export const Route = createFileRoute("/_authenticated/admin/")({
	component: ReviewQueuePage,
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.ADMIN_DISPUTES, deps],
			queryFn: () =>
				adminDisputesRequest({ data: { ...deps, limit: DEFAULT_PAGE_LIMIT } }),
		}),
});
