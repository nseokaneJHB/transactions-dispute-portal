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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatDate, humanize } from "@/lib/format";

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
				<div className="flex flex-col gap-3">
					{data.map((dispute) => (
						<Card key={dispute.id}>
							<CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
								<CardTitle className="flex items-center gap-2">
									{humanize(dispute.reason)}
									<StatusBadge status={dispute.status} />
								</CardTitle>
								<span className="text-muted-foreground text-xs">
									Opened {formatDate(dispute.created_at)}
								</span>
							</CardHeader>
							<CardContent>
								<p className="text-muted-foreground text-xs">
									Customer {dispute.user_id}
								</p>
								<p className="text-sm whitespace-pre-wrap">
									{dispute.description}
								</p>
								{dispute.resolution_note && (
									<p className="bg-muted rounded-md p-3 text-sm">
										<span className="font-medium">Decision note: </span>
										{dispute.resolution_note}
									</p>
								)}
								<div className="pt-1">
									<DisputeActions dispute={dispute} />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
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
