import { createRouter, defaultStringifySearch } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

import { NotFound } from "@/components/not-found";
import { RouteError } from "@/components/error";

import { createQueryClient } from "@/integrations/query-provider";

/**
 * List-query params read best in a fixed order regardless of the order the UI
 * happens to set them: `page` then `limit` always lead; then `search`, then
 * `status`; the date range and finally `sort` / `order` trail. Any other key
 * sorts into the middle. Only affects the query string's rendering, not its
 * meaning.
 */
const SEARCH_KEY_RANK: Record<string, number> = {
	page: 0,
	limit: 1,
	search: 2,
	status: 3,
	from: 95,
	to: 96,
	sort: 98,
	order: 99,
};

const stringifySearch = (search: Record<string, unknown>): string => {
	const ordered = Object.fromEntries(
		Object.keys(search)
			.sort(
				(a, b) => (SEARCH_KEY_RANK[a] ?? 50) - (SEARCH_KEY_RANK[b] ?? 50),
			)
			.map((key) => [key, search[key]]),
	);
	return defaultStringifySearch(ordered);
};

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
		stringifySearch,
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
};
