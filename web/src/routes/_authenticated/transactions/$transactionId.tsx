import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { transactionRequest } from "@/api/transaction";
import { QUERY_KEYS } from "@/api/constant";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DisputeForm } from "@/components/disputes/dispute-form";
import { formatDateTime, formatZar } from "@/lib/format";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-center justify-between gap-4 py-2 text-sm">
		<span className="text-muted-foreground">{label}</span>
		<span className="font-medium">{value}</span>
	</div>
);

const TransactionDetailPage = () => {
	const { data: transaction } = Route.useLoaderData();

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

			<Card>
				<CardHeader>
					<CardTitle>Dispute this transaction</CardTitle>
					<CardDescription>
						Raise a dispute if this charge is wrong. You can only have one open
						dispute per transaction.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DisputeForm transactionId={transaction.id} />
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute(
	"/_authenticated/transactions/$transactionId",
)({
	component: TransactionDetailPage,
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.TRANSACTION, params.transactionId],
			queryFn: () => transactionRequest({ data: params.transactionId }),
		}),
});
