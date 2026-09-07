import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { GavelIcon, SearchCheckIcon } from "lucide-react";

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
import { SelectField, TextAreaField } from "@/components/custom/text-field";
import { useFormField } from "@/hooks/use-form-field";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import { humanize } from "@/lib/format";

const ResolveForm = ({ disputeId }: { disputeId: string }) => {
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
				await queryClient.invalidateQueries({
					queryKey: QUERY_KEYS.ADMIN_DISPUTES,
				});
				await router.invalidate();
			},
		});

	return (
		<form
			className="flex flex-col gap-3 sm:max-w-md"
			onSubmit={handleSubmit(onSubmit)}
		>
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

export const DisputeActions = ({ dispute }: { dispute: AdminDispute }) => {
	const router = useRouter();
	const queryClient = useQueryClient();

	const { mutateAsync, isPending } = useMutation({
		mutationFn: () => reviewDispute(dispute.id),
	});

	const startReview = () =>
		useToastMutation({
			loading: "Moving to review…",
			promise: mutateAsync(),
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: QUERY_KEYS.ADMIN_DISPUTES,
				});
				await router.invalidate();
			},
		});

	if (!isOpenDisputeStatus(dispute.status)) {
		return (
			<p className="text-muted-foreground text-sm">
				Closed — no further action.
			</p>
		);
	}

	if (dispute.status === DISPUTE_STATUS.SUBMITTED) {
		return (
			<Button size="sm" disabled={isPending} onClick={startReview}>
				{isPending ? <Spinner /> : <SearchCheckIcon />}
				Move to review
			</Button>
		);
	}

	return <ResolveForm disputeId={dispute.id} />;
};
