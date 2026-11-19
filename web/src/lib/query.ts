import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { useRouter } from "@tanstack/react-router";

type Router = Pick<ReturnType<typeof useRouter>, "invalidate">;

/**
 * Force one or more route-loader-driven queries to refetch after a mutation,
 * then rerun the current route's loader(s) so `Route.useLoaderData()` picks
 * up the fresh data.
 *
 * This removes the cache entries rather than invalidating them.
 * `invalidateQueries` on its own refetches only queries with a live
 * `useQuery` observer (default `refetchType: "active"`). Every read here goes
 * through `fetchQuery` in a route `loader` and is read back with
 * `useLoaderData()`, which leaves no observer. A forced refetch
 * (`refetchType: "all"`) fails for a query populated during SSR, because
 * functions don't survive dehydration and the hydrated entry has no
 * `queryFn`. Removing the entry means the loader that `router.invalidate()`
 * reruns finds nothing cached and fetches with its own `queryFn`. It also
 * drops every cached variant of the list (other filters, sorts and cursors),
 * not just the one on screen, and covers the root session read, which still
 * uses `ensureQueryData` and so ignores the invalidated flag.
 */
export const refreshQuery = async (
	queryClient: QueryClient,
	router: Router,
	queryKeys: QueryKey[],
): Promise<void> => {
	for (const queryKey of queryKeys) {
		queryClient.removeQueries({ queryKey });
	}
	await router.invalidate();
};
