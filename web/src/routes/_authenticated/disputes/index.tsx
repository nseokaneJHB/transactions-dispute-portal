import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ChevronRightIcon, ScaleIcon } from "lucide-react";

import {
	DISPUTE_STATUS,
	DEFAULT_PAGE_LIMIT,
} from "@transaction-dispute-portal/shared";

import { disputesRequest } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import { PageHeader } from "@/components/custom/page-header";
import { Pagination } from "@/components/custom/pagination";
import { EmptyState } from "@/components/custom/empty-state";
import { StatusBadge } from "@/components/custom/status-badge";
import { Select } from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDate, humanize } from "@/lib/format";

const searchSchema = z.object({
	page: z.coerce.number().int().positive().optional(),
	status: z.enum(DISPUTE_STATUS).optional(),
});

const DisputesPage = () => {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, page, count, limit } = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Your disputes"
				description="A record of every dispute you've raised and where it stands."
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
				<EmptyState
					icon={ScaleIcon}
					title="No disputes yet"
					description="When you dispute a transaction it will show up here."
					action={
						<Button asChild variant="secondary">
							<Link to="/transactions">Go to transactions</Link>
						</Button>
					}
				/>
			) : (
				<Table>
					<TableHead>
						<tr>
							<TableHeaderCell>Opened</TableHeaderCell>
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
								<TableCell className="font-medium">
									{humanize(dispute.reason)}
								</TableCell>
								<TableCell>
									<StatusBadge status={dispute.status} />
								</TableCell>
								<TableCell className="text-right">
									<Button asChild variant="ghost" size="sm">
										<Link
											to="/disputes/$disputeId"
											params={{ disputeId: dispute.id }}
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

export const Route = createFileRoute("/_authenticated/disputes/")({
	component: DisputesPage,
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.DISPUTES, deps],
			queryFn: () =>
				disputesRequest({ data: { ...deps, limit: DEFAULT_PAGE_LIMIT } }),
		}),
});
