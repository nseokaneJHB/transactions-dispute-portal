import { useState } from "react";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { EyeIcon, GavelIcon, SearchCheckIcon } from "lucide-react";

import {
	DISPUTE_STATUS,
	ADMIN_RESOLUTION_STATUS,
	isOpenDisputeStatus,
	disputeResolveBodySchema,
	type AdminDispute,
	type DisputeResolveBody,
} from "@transaction-dispute-portal/shared";

import { reviewDispute, resolveDispute } from "@/api/admin";
import { QUERY_KEYS } from "@/api/constant";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/custom/status-badge";
import { SelectField, TextAreaField } from "@/components/custom/text-field";
import { useFormField } from "@/hooks/use-form-field";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import { formatDate, formatZar, humanize } from "@/lib/format";
import { refreshQuery } from "@/lib/query";

const ResolveForm = ({
	disputeId,
	onDone,
}: {
	disputeId: string;
	onDone: () => void;
}) => {
	const router = useRouter();
	const queryClient = useQueryClient();

	const { control, handleSubmit } = useForm<DisputeResolveBody>({
		mode: "onChange",
		resolver: zodResolver(disputeResolveBodySchema),
		defaultValues: { resolution: ADMIN_RESOLUTION_STATUS[0], note: "" },
	});

	const resolution = useFormField({
		name: "resolution",
		control,
		type: "select",
	});
	const note = useFormField({ name: "note", control });

	const { mutateAsync, isPending } = useMutation({
		mutationFn: resolveDispute,
	});

	const onSubmit = (values: DisputeResolveBody) =>
		useToastMutation({
			loading: "Recording your decision…",
			promise: mutateAsync({ ...values, disputeId }),
			onSuccess: async () => {
				await refreshQuery(queryClient, router, [QUERY_KEYS.ADMIN_DISPUTES]);
				onDone();
			},
		});

	return (
		<form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
			<SelectField
				id={`resolution-${disputeId}`}
				label="Decision"
				value={resolution.value}
				onChange={(event) => resolution.onChange(event.target.value)}
				error={resolution.error}
			>
				{ADMIN_RESOLUTION_STATUS.map((value) => (
					<option key={value} value={value}>
						{humanize(value)}
					</option>
				))}
			</SelectField>
			<TextAreaField
				id={`note-${disputeId}`}
				label="Note to the customer"
				placeholder="Explain the outcome. This is recorded on the dispute."
				rows={3}
				value={note.value}
				onChange={note.onChange}
				error={note.error}
			/>
			<Button
				type="submit"
				size="sm"
				disabled={isPending}
				className="self-start"
			>
				{isPending ? <Spinner /> : <GavelIcon />}
				Submit decision
			</Button>
		</form>
	);
};

const DisputeReviewDialog = ({
	dispute,
	onOpenChange,
}: {
	dispute: AdminDispute;
	onOpenChange: (open: boolean) => void;
}) => {
	const router = useRouter();
	const queryClient = useQueryClient();
	const open = isOpenDisputeStatus(dispute.status);

	const { mutateAsync, isPending } = useMutation({
		mutationFn: () => reviewDispute(dispute.id),
	});

	const startReview = () =>
		useToastMutation({
			loading: "Moving to review…",
			promise: mutateAsync(),
			onSuccess: async () => {
				await refreshQuery(queryClient, router, [QUERY_KEYS.ADMIN_DISPUTES]);
				onOpenChange(false);
			},
		});

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					{humanize(dispute.reason)}
					<StatusBadge status={dispute.status} />
				</DialogTitle>
				<DialogDescription>
					{dispute.transaction.merchant_name} —{" "}
					{formatZar(dispute.transaction.amount_cents)} on{" "}
					{formatDate(dispute.transaction.transacted_at)}
				</DialogDescription>
			</DialogHeader>

			<div className="flex flex-col gap-3">
				<p className="text-muted-foreground text-xs">
					Customer {dispute.user_id}
				</p>
				<p className="text-sm whitespace-pre-wrap">{dispute.description}</p>

				{dispute.resolution_note && (
					<p className="bg-muted rounded-md p-3 text-sm">
						<span className="font-medium">Decision note: </span>
						{dispute.resolution_note}
					</p>
				)}

				{!open && (
					<p className="text-muted-foreground text-sm">
						Closed — no further action.
					</p>
				)}

				{open && dispute.status === DISPUTE_STATUS.SUBMITTED && (
					<Button size="sm" disabled={isPending} onClick={startReview}>
						{isPending ? <Spinner /> : <SearchCheckIcon />}
						Move to review
					</Button>
				)}

				{open && dispute.status === DISPUTE_STATUS.UNDER_REVIEW && (
					<ResolveForm
						disputeId={dispute.id}
						onDone={() => onOpenChange(false)}
					/>
				)}
			</div>
		</DialogContent>
	);
};

export const DisputeActions = ({ dispute }: { dispute: AdminDispute }) => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const open = isOpenDisputeStatus(dispute.status);

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			<DialogTrigger asChild>
				<Button variant={open ? "primary" : "ghost"} size="sm">
					{open ? <SearchCheckIcon /> : <EyeIcon />}
					{open ? "Review" : "View"}
				</Button>
			</DialogTrigger>
			{dialogOpen && (
				<DisputeReviewDialog dispute={dispute} onOpenChange={setDialogOpen} />
			)}
		</Dialog>
	);
};
