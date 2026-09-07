import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";

import {
	ADMIN_INVITE_EXPIRY_HOURS,
	adminInviteCreateBodySchema,
	type AdminInviteCreateBody,
} from "@transaction-dispute-portal/shared";

import { sendAdminInvite } from "@/api/admin";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/custom/text-field";
import { PageHeader } from "@/components/custom/page-header";
import { useFormField } from "@/hooks/use-form-field";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import type { ApiError } from "@/api";

const InviteAdminPage = () => {
	const { control, handleSubmit, reset, setError } =
		useForm<AdminInviteCreateBody>({
			mode: "onChange",
			resolver: zodResolver(adminInviteCreateBodySchema),
			defaultValues: { email: "" },
		});

	const email = useFormField({ name: "email", control });
	const { mutateAsync, isPending } = useMutation({
		mutationFn: sendAdminInvite,
	});

	const onSubmit = (values: AdminInviteCreateBody) =>
		useToastMutation({
			loading: "Sending the invite…",
			promise: mutateAsync(values),
			onSuccess: () => reset(),
			onError: (error: ApiError) =>
				error.errors?.forEach((issue) =>
					setError(issue.field as keyof AdminInviteCreateBody, {
						message: issue.message,
					}),
				),
		});

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Invite an admin"
				description="Admin accounts are invite-only — there's no self-service signup."
			/>

			<Card className="max-w-lg">
				<CardHeader>
					<CardTitle>Send an invite</CardTitle>
					<CardDescription>
						We email a one-time link that expires in {ADMIN_INVITE_EXPIRY_HOURS}{" "}
						hours. The invitee sets their name, then signs in with this email.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={handleSubmit(onSubmit)}
						noValidate
					>
						<TextField
							id="email"
							type="email"
							label="Email address"
							placeholder="new.admin@example.com"
							value={email.value}
							onChange={email.onChange}
							error={email.error}
						/>
						<Button type="submit" disabled={isPending} className="self-start">
							{isPending ? <Spinner /> : <SendIcon />}
							Send invite
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/admin/invites")({
	component: InviteAdminPage,
});
