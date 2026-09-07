import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ScaleIcon } from "lucide-react";

import {
	DISPUTE_REASON,
	disputeCreateBodySchema,
	type DisputeCreateBody,
} from "@transaction-dispute-portal/shared";

import { submitDispute } from "@/api/dispute";
import { QUERY_KEYS } from "@/api/constant";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SelectField, TextAreaField } from "@/components/custom/text-field";
import { useFormField } from "@/hooks/use-form-field";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import { humanize } from "@/lib/format";
import { refreshQuery } from "@/lib/query";
import type { ApiError } from "@/api";

export const DisputeForm = ({ transactionId }: { transactionId: string }) => {
	const router = useRouter();
	const queryClient = useQueryClient();

	const { control, handleSubmit, setError } = useForm<DisputeCreateBody>({
		mode: "onChange",
		resolver: zodResolver(disputeCreateBodySchema),
		defaultValues: {
			transactionId,
			reason: DISPUTE_REASON.FRAUDULENT_CHARGE,
			description: "",
		},
	});

	const reason = useFormField({ name: "reason", control, type: "select" });
	const description = useFormField({ name: "description", control });

	const { mutateAsync, isPending } = useMutation({ mutationFn: submitDispute });

	const onSubmit = (values: DisputeCreateBody) =>
		useToastMutation({
			loading: "Opening your dispute…",
			promise: mutateAsync(values),
			onSuccess: async (response) => {
				await refreshQuery(queryClient, router, [QUERY_KEYS.DISPUTES]);
				await router.navigate({
					to: "/disputes/$disputeId",
					params: { disputeId: response.data.id },
				});
			},
			onError: (error: ApiError) =>
				error.errors?.forEach((issue) =>
					setError(issue.field as keyof DisputeCreateBody, {
						message: issue.message,
					}),
				),
		});

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
			<SelectField
				id="reason"
				label="Reason"
				value={reason.value}
				onChange={(event) => reason.onChange(event.target.value)}
				error={reason.error}
			>
				{Object.values(DISPUTE_REASON).map((value) => (
					<option key={value} value={value}>
						{humanize(value)}
					</option>
				))}
			</SelectField>

			<TextAreaField
				id="description"
				label="What's wrong with this charge?"
				placeholder="Give us the details a reviewer will need."
				rows={5}
				value={description.value}
				onChange={description.onChange}
				error={description.error}
				hint="Up to 2000 characters."
			/>

			<Button type="submit" disabled={isPending} className="self-start">
				{isPending ? <Spinner /> : <ScaleIcon />}
				Submit dispute
			</Button>
		</form>
	);
};
