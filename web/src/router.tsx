import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

import { NotFound } from "@/components/not-found";
import { RouteError } from "@/components/error";

import { createQueryClient } from "@/integrations/query-provider";

export const getRouter = () => {
	const queryClient = createQueryClient();

	const router = createRouter({
		routeTree,
		context: { queryClient, user: null },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: NotFound,
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
};
