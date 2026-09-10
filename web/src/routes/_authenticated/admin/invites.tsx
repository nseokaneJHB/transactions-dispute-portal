import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";

import {
	ADMIN_INVITE_EXPIRY_HOURS,
	ADMIN_INVITE_SORT,
	ADMIN_INVITE_STATUS,
	adminInviteCreateBodySchema,
	adminInvitesQuerySchema,
	type AdminInviteCreateBody,
} from "@transaction-dispute-portal/shared";

import { adminInvitesRequest, sendAdminInvite } from "@/api/admin";
import { QUERY_KEYS } from "@/api/constant";
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
import { DataList } from "@/components/custom/data-list";
import { InviteStatusBadge } from "@/components/custom/status-badge";
import { useFormField } from "@/hooks/use-form-field";
import { runToastMutation } from "@/lib/toast-mutation";
import { applyServerErrors } from "@/lib/form";
import { formatDate } from "@/lib/format";
import { refreshQuery } from "@/lib/query";

const InviteAdminPage = () => {
	const router = useRouter();
	const queryClient = useQueryClient();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const result = Route.useLoaderData();

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
		runToastMutation({
			loading: "Sending the invite…",
			promise: mutateAsync(values),
			onSuccess: async () => {
				reset();
				await refreshQuery(queryClient, router, [QUERY_KEYS.ADMIN_INVITES]);
			},
			onError: (error) => applyServerErrors(setError, error),
		});

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Invitations"
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

			<div className="flex flex-col gap-3">
				<h2 className="text-sm font-medium">Invites you've sent</h2>

				<DataList
					result={result}
					search={search}
					onSearchChange={(next) => navigate({ search: next })}
					searchPlaceholder="Invitee email"
					statusOptions={Object.values(ADMIN_INVITE_STATUS)}
					emptyState={{
						title: "No invites match",
						description: "Invites you send appear here with their status.",
					}}
					columns={[
						{
							header: "Email",
							sortKey: ADMIN_INVITE_SORT.email,
							cellClassName: "font-medium",
							cell: (invite) => invite.email,
						},
						{
							header: "Sent",
							sortKey: ADMIN_INVITE_SORT.created_at,
							cellClassName: "text-muted-foreground whitespace-nowrap",
							cell: (invite) => formatDate(invite.created_at),
						},
						{
							header: "Status",
							sortKey: ADMIN_INVITE_SORT.status,
							cell: (invite) => <InviteStatusBadge status={invite.status} />,
						},
						{
							header: "Accepted / expires",
							sortKey: ADMIN_INVITE_SORT.expires_at,
							cellClassName: "text-muted-foreground whitespace-nowrap",
							cell: (invite) =>
								invite.status === ADMIN_INVITE_STATUS.ACCEPTED &&
								invite.accepted_at
									? formatDate(invite.accepted_at)
									: formatDate(invite.expires_at),
						},
					]}
				/>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/_authenticated/admin/invites")({
	component: InviteAdminPage,
	validateSearch: adminInvitesQuerySchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData({
			queryKey: [...QUERY_KEYS.ADMIN_INVITES, deps],
			queryFn: () => adminInvitesRequest({ data: deps }),
		}),
});
