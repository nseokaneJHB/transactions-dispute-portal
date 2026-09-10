import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { ShieldCheckIcon } from "lucide-react";

import {
	APP_NAME,
	adminInviteAcceptBodySchema,
	type AdminInviteAcceptBody,
} from "@transaction-dispute-portal/shared";

import { acceptAdminInvite } from "@/api/auth";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/custom/text-field";
import { useFormField } from "@/hooks/use-form-field";
import { runToastMutation } from "@/lib/toast-mutation";
import { applyServerErrors } from "@/lib/form";

const searchSchema = z.object({ token: z.string().optional() });

const AcceptInvitePage = () => {
	const router = useRouter();
	const { token } = Route.useSearch();

	const { control, handleSubmit, setError } = useForm<AdminInviteAcceptBody>({
		mode: "onChange",
		resolver: zodResolver(adminInviteAcceptBodySchema),
		defaultValues: { name: "" },
	});

	const name = useFormField({ name: "name", control });
	const { mutateAsync, isPending } = useMutation({
		mutationFn: acceptAdminInvite,
	});

	const onSubmit = (values: AdminInviteAcceptBody) => {
		if (!token) return;
		runToastMutation({
			loading: "Setting up your admin account…",
			promise: mutateAsync({ ...values, token }),
			onSuccess: () => router.navigate({ to: "/sign-in" }),
			onError: (error) => applyServerErrors(setError, error),
		});
	};

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<span className="bg-primary size-6 rounded-md" />
				{APP_NAME}
			</div>

			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Accept your admin invite</CardTitle>
					<CardDescription>
						{token
							? "Choose the name reviewers will see, then sign in with the email your invite was sent to."
							: "This link is missing its token — open it straight from your invite email."}
					</CardDescription>
				</CardHeader>

				<form
					className="flex flex-col gap-4"
					onSubmit={handleSubmit(onSubmit)}
					noValidate
				>
					<TextField
						id="name"
						label="Your name"
						placeholder="Jordan Adams"
						autoFocus
						disabled={!token}
						value={name.value}
						onChange={name.onChange}
						error={name.error}
					/>
					<Button type="submit" disabled={!token || isPending}>
						{isPending ? <Spinner /> : <ShieldCheckIcon />}
						Create admin account
					</Button>
				</form>

				<Button asChild variant="ghost" size="sm">
					<Link to="/sign-in">Already have an account? Sign in</Link>
				</Button>
			</Card>
		</div>
	);
};

export const Route = createFileRoute("/admin/invite")({
	component: AcceptInvitePage,
	validateSearch: searchSchema,
});
