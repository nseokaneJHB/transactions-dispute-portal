import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { USER_ROLE, FRONTEND_URLS } from "@transaction-dispute-portal/shared";

import { Navigation } from "@/components/navigation";
import { useDisputeNotifications } from "@/hooks/use-dispute-notifications";

const AuthenticatedLayout = () => {
	const { user } = Route.useRouteContext();

	useDisputeNotifications(user.role === USER_ROLE.CUSTOMER ? user.id : "");

	return (
		<div className="flex min-h-svh flex-col">
			<Navigation user={user} />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
				<Outlet />
			</main>
		</div>
	);
};

const CUSTOMER_HOME = FRONTEND_URLS.TRANSACTIONS;
const ADMIN_HOME = FRONTEND_URLS.ADMIN;

/** Paths both roles can open — everything else is role-scoped. */
const SHARED_PREFIXES = ["/account"];

export const Route = createFileRoute("/_authenticated")({
	component: AuthenticatedLayout,
	beforeLoad: ({ context, location }) => {
		const { user } = context;

		if (!user) {
			throw redirect({ to: FRONTEND_URLS.SIGN_IN });
		}

		const shared = SHARED_PREFIXES.some((prefix) =>
			location.pathname.startsWith(prefix),
		);
		const inAdmin = location.pathname.startsWith(ADMIN_HOME);

		if (!shared) {
			if (user.role === USER_ROLE.ADMIN && !inAdmin) {
				throw redirect({ to: ADMIN_HOME });
			}
			if (user.role === USER_ROLE.CUSTOMER && inAdmin) {
				throw redirect({ to: CUSTOMER_HOME });
			}
		}

		return { user };
	},
});
