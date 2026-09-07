import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2Icon } from "lucide-react";

import { APP_NAME } from "@transaction-dispute-portal/shared";

import { confirmEmailChange } from "@/api/auth";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToastMutation } from "@/hooks/use-toast-mutation";

const searchSchema = z.object({ token: z.string().optional() });

const EmailChangePage = () => {
	const { token } = Route.useSearch();

	const { mutateAsync, isPending, isSuccess } = useMutation({
		mutationFn: confirmEmailChange,
	});

	const confirm = () => {
		if (!token) return;
		useToastMutation({
			loading: "Confirming this step…",
			promise: mutateAsync({ token }),
		});
	};

	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<span className="bg-primary size-6 rounded-md" />
				{APP_NAME}
			</div>

			<Card className="w-full max-w-sm items-center text-center">
				<CardHeader className="items-center">
					<CardTitle>Confirm email change</CardTitle>
					<CardDescription>
						{!token
							? "This link is missing its token — open it straight from your email."
							: isSuccess
								? "Step confirmed. If another email is waiting, follow that link too. Otherwise you're done."
								: "The email change happens in two steps: an approval from your old address, then a confirmation from the new one. Confirm this step below."}
					</CardDescription>
				</CardHeader>

				{isSuccess ? (
					<CheckCircle2Icon className="text-status-resolved size-8" />
				) : (
					<Button disabled={!token || isPending} onClick={confirm}>
						{isPending && <Spinner />}
						Confirm this step
					</Button>
				)}

				<Button asChild variant="ghost" size="sm">
					<Link to="/sign-in">Back to sign in</Link>
				</Button>
			</Card>
		</div>
	);
};

export const Route = createFileRoute("/account/email-change")({
	component: EmailChangePage,
	validateSearch: searchSchema,
});
