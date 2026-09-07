import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { APP_NAME } from "@transaction-dispute-portal/shared";

const UnauthenticatedLayout = () => (
	<div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
		<div className="flex items-center gap-2 text-sm font-semibold">
			<span className="bg-primary size-6 rounded-md" />
			{APP_NAME}
		</div>
		<Outlet />
	</div>
);

export const Route = createFileRoute("/_unauthenticated")({
	component: UnauthenticatedLayout,
	beforeLoad: ({ context }) => {
		if (context.user) {
			throw redirect({ to: "/" });
		}
	},
});
