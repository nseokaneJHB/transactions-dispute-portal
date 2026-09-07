import { createFileRoute, redirect } from "@tanstack/react-router";

import { USER_ROLE, FRONTEND_URLS } from "@transaction-dispute-portal/shared";

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		if (!context.user) {
			throw redirect({ to: FRONTEND_URLS.SIGN_IN });
		}

		throw redirect({
			to:
				context.user.role === USER_ROLE.ADMIN
					? FRONTEND_URLS.ADMIN
					: FRONTEND_URLS.TRANSACTIONS,
		});
	},
});
