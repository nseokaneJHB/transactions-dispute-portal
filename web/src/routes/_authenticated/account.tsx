import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";

import {
	authChangeEmailBodySchema,
	type AuthChangeEmailBody,
} from "@transaction-dispute-portal/shared";

import { requestEmailChange } from "@/api/auth";
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
import { runToastMutation } from "@/lib/toast-mutation";
import { applyServerErrors } from "@/lib/form";
import { formatDate } from "@/lib/format";

const AccountPage = () => {
	const { user } = Route.useRouteContext();

	const { control, handleSubmit, reset, setError } =
		useForm<AuthChangeEmailBody>({
			mode: "onChange",
			resolver: zodResolver(authChangeEmailBodySchema),
			defaultValues: { newEmail: "" },
		});

	const newEmail = useFormField({ name: "newEmail", control });
	const { mutateAsync, isPending } = useMutation({
		mutationFn: requestEmailChange,
	});

	const onSubmit = (values: AuthChangeEmailBody) =>
		runToastMutation({
			loading: "Sending the approval link…",
			promise: mutateAsync(values),
			onSuccess: () => reset(),
			onError: (error) => applyServerErrors(setError, error),
		});

	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Account" description="Your sign-in details." />

			<Card>
				<CardHeader>
					<CardTitle>Profile</CardTitle>
				</CardHeader>
				<CardContent className="divide-y text-sm">
					<div className="flex justify-between py-2">
						<span className="text-muted-foreground">Name</span>
						<span className="font-medium">{user.name}</span>
					</div>
					<div className="flex justify-between py-2">
						<span className="text-muted-foreground">Email</span>
						<span className="font-medium">{user.email}</span>
					</div>
					<div className="flex justify-between py-2">
						<span className="text-muted-foreground">Member since</span>
						<span className="font-medium">{formatDate(user.created_at)}</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Change sign-in email</CardTitle>
					<CardDescription>
						We email an approval link to your current address first, then a
						confirmation to the new one. Nothing changes until you follow both.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-4"
						onSubmit={handleSubmit(onSubmit)}
						noValidate
					>
						<TextField
							id="newEmail"
							type="email"
							label="New email address"
							placeholder="new@example.com"
							value={newEmail.value}
							onChange={newEmail.onChange}
							error={newEmail.error}
						/>
						<Button type="submit" disabled={isPending} className="self-start">
							{isPending ? <Spinner /> : <MailIcon />}
							Send approval link
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/account")({
	component: AccountPage,
});
