import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { isOpenDisputeStatus } from "@transaction-dispute-portal/shared";

import { disputeRequest } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { WithdrawButton } from "@/components/disputes/withdraw-button";
import { formatDateTime, humanize } from "@/lib/format";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-start justify-between gap-4 py-2 text-sm">
		<span className="text-muted-foreground">{label}</span>
		<span className="max-w-[60%] text-right font-medium">{value}</span>
	</div>
);

const DisputeDetailPage = () => {
	const { data: dispute } = Route.useLoaderData();
	const open = isOpenDisputeStatus(dispute.status);

	return (
		<div className="flex flex-col gap-5">
			<Button asChild variant="ghost" size="sm" className="self-start">
				<Link to="/disputes">
					<ArrowLeftIcon />
					All disputes
				</Link>
			</Button>

			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<CardTitle>{humanize(dispute.reason)}</CardTitle>
					<StatusBadge status={dispute.status} />
				</CardHeader>
				<CardContent className="divide-y">
					<DetailRow
						label="Opened"
						value={formatDateTime(dispute.created_at)}
					/>
					<DetailRow label="Transaction" value={dispute.transaction_id} />
					{dispute.resolved_at && (
						<DetailRow
							label="Closed"
							value={formatDateTime(dispute.resolved_at)}
						/>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Your account of the problem</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm whitespace-pre-wrap">{dispute.description}</p>
				</CardContent>
			</Card>

			{dispute.resolution_note && (
				<Card>
					<CardHeader>
						<CardTitle>Reviewer's note</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm whitespace-pre-wrap">
							{dispute.resolution_note}
						</p>
					</CardContent>
				</Card>
			)}

			{open && (
				<Card>
					<CardHeader>
						<CardTitle>Changed your mind?</CardTitle>
					</CardHeader>
					<CardContent>
						<WithdrawButton disputeId={dispute.id} />
					</CardContent>
				</Card>
			)}
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/disputes/$disputeId")({
	component: DisputeDetailPage,
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.DISPUTE, params.disputeId],
			queryFn: () => disputeRequest({ data: params.disputeId }),
		}),
});
