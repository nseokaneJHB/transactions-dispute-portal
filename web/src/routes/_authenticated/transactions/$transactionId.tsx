import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";

import {
	MAX_PAGE_LIMIT,
	isOpenDisputeStatus,
} from "@transaction-dispute-portal/shared";

import { transactionRequest } from "@/api/transaction";
import { disputesRequest } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { DetailRow } from "@/components/custom/detail-row";
import { DisputeForm } from "@/components/disputes/dispute-form";
import { formatDate, formatDateTime, formatZar, humanize } from "@/lib/format";

const TransactionDetailPage = () => {
	const { data: transaction } = Route.useLoaderData({
		select: (data) => data.transaction,
	});
	const { data: disputes } = Route.useLoaderData({
		select: (data) => data.disputes,
	});

	const openDispute = disputes.find((dispute) =>
		isOpenDisputeStatus(dispute.status),
	);
	const history = disputes.filter((dispute) => dispute.id !== openDispute?.id);

	return (
		<div className="flex flex-col gap-5">
			<Button asChild variant="ghost" size="sm" className="self-start">
				<Link to="/transactions">
					<ArrowLeftIcon />
					All transactions
				</Link>
			</Button>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{transaction.merchant_name}</CardTitle>
					<CardDescription>
						{formatZar(transaction.amount_cents)}
					</CardDescription>
				</CardHeader>
				<CardContent className="divide-y">
					<DetailRow
						label="Transacted"
						value={formatDateTime(transaction.transacted_at)}
					/>
					<DetailRow label="Reference" value={transaction.id} />
				</CardContent>
			</Card>

			{openDispute ? (
				<Card>
					<CardHeader>
						<CardTitle>You have an open dispute</CardTitle>
						<CardDescription>
							{humanize(openDispute.reason)} — opened{" "}
							{formatDate(openDispute.created_at)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link
								to="/disputes/$disputeId"
								params={{ disputeId: openDispute.id }}
							>
								View dispute
								<ChevronRightIcon />
							</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Dispute this transaction</CardTitle>
						<CardDescription>
							Raise a dispute if this charge is wrong. You can only have one
							open dispute per transaction.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DisputeForm transactionId={transaction.id} />
					</CardContent>
				</Card>
			)}

			{history.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Dispute history</CardTitle>
						<CardDescription>
							Past disputes raised on this transaction.
						</CardDescription>
					</CardHeader>
					<CardContent className="divide-y">
						{history.map((dispute) => (
							<Link
								key={dispute.id}
								to="/disputes/$disputeId"
								params={{ disputeId: dispute.id }}
								className="hover:bg-muted -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3"
							>
								<div>
									<p className="text-sm font-medium">
										{humanize(dispute.reason)}
									</p>
									<p className="text-muted-foreground text-sm">
										{formatDate(dispute.created_at)}
									</p>
								</div>
								<StatusBadge status={dispute.status} />
							</Link>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
};

export const Route = createFileRoute(
	"/_authenticated/transactions/$transactionId",
)({
	component: TransactionDetailPage,
	loader: async ({ context, params }) => {
		const [transaction, disputes] = await Promise.all([
			context.queryClient.ensureQueryData({
				queryKey: [...QUERY_KEYS.TRANSACTION, params.transactionId],
				queryFn: () => transactionRequest({ data: params.transactionId }),
			}),
			context.queryClient.ensureQueryData({
				queryKey: [
					...QUERY_KEYS.DISPUTES,
					{ transaction_id: params.transactionId },
				],
				queryFn: () =>
					disputesRequest({
						data: {
							transaction_id: params.transactionId,
							limit: MAX_PAGE_LIMIT,
						},
					}),
			}),
		]);

		return { transaction, disputes };
	},
});
