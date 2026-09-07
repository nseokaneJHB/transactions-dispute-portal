import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";

import { USER_ROLE, FRONTEND_URLS } from "@transaction-dispute-portal/shared";

const AdminLayout = () => (
	<div className="flex flex-col gap-5">
		<nav className="flex gap-1 text-sm">
			<Link
				to={FRONTEND_URLS.ADMIN}
				activeOptions={{ exact: true }}
				className="text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 font-medium"
				activeProps={{ className: "bg-muted text-foreground" }}
			>
				Review queue
			</Link>
			<Link
				to="/admin/invites"
				className="text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 font-medium"
				activeProps={{ className: "bg-muted text-foreground" }}
			>
				Invite an admin
			</Link>
		</nav>
		<Outlet />
	</div>
);

export const Route = createFileRoute("/_authenticated/admin")({
	component: AdminLayout,
	beforeLoad: ({ context }) => {
		if (context.user?.role !== USER_ROLE.ADMIN) {
			throw redirect({ to: FRONTEND_URLS.TRANSACTIONS });
		}
	},
});
