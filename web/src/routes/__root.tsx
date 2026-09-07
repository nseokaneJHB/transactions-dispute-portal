/// <reference types="vite/client" />
import type { PropsWithChildren } from "react";

import {
	Outlet,
	Scripts,
	HeadContent,
	createRootRouteWithContext,
} from "@tanstack/react-router";

import type { QueryClient } from "@tanstack/react-query";

import { APP_NAME, type AuthSession } from "@transaction-dispute-portal/shared";

import appCss from "../styles.css?url";

import { Toaster } from "@/components/ui/sonner";

import { QUERY_KEYS } from "@/api/constant";
import { sessionRequest } from "@/api/auth";

export interface RouterContext {
	queryClient: QueryClient;
	user: AuthSession | null;
}

const RootDocument = ({ children }: PropsWithChildren) => (
	<html lang="en">
		<head>
			<HeadContent />
		</head>
		<body>
			{children}
			<Toaster />
			<Scripts />
		</body>
	</html>
);

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<RootDocument>
			<Outlet />
		</RootDocument>
	),
	head: () => ({
		links: [{ rel: "stylesheet", href: appCss }],
		meta: [
			{ charSet: "utf-8" },
			{ title: APP_NAME },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
		],
	}),
	beforeLoad: async ({ context }) => {
		try {
			const response = await context.queryClient.ensureQueryData({
				queryKey: QUERY_KEYS.SESSION,
				queryFn: () => sessionRequest(),
			});

			return { user: response.data };
		} catch {
			return { user: null };
		}
	},
});
