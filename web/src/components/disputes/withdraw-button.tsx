import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Undo2Icon } from "lucide-react";

import { withdrawDispute } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import { refreshQuery } from "@/lib/query";

export const WithdrawButton = ({ disputeId }: { disputeId: string }) => {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);

	const { mutateAsync, isPending } = useMutation({
		mutationFn: () => withdrawDispute(disputeId),
	});

	const withdraw = () =>
		useToastMutation({
			loading: "Withdrawing your dispute…",
			promise: mutateAsync(),
			onSuccess: async () => {
				setConfirming(false);
				await refreshQuery(queryClient, router, [
					QUERY_KEYS.DISPUTES,
					[...QUERY_KEYS.DISPUTE, disputeId],
				]);
			},
		});

	if (!confirming) {
		return (
			<Button variant="secondary" onClick={() => setConfirming(true)}>
				<Undo2Icon />
				Withdraw dispute
			</Button>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-muted-foreground text-sm">
				Withdraw this dispute? This can't be undone.
			</span>
			<Button variant="destructive" disabled={isPending} onClick={withdraw}>
				{isPending && <Spinner />}
				Yes, withdraw
			</Button>
			<Button
				variant="ghost"
				disabled={isPending}
				onClick={() => setConfirming(false)}
			>
				Keep it open
			</Button>
		</div>
	);
};
