import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { useRouter } from "@tanstack/react-router";

type Router = Pick<ReturnType<typeof useRouter>, "invalidate">;

/**
 * Force one or more route-loader-driven queries to refetch after a mutation,
 * then rerun the current route's loader(s) so `Route.useLoaderData()` picks
 * up the fresh data.
 *
 * This removes the cache entries rather than invalidating them. Two things
 * rule out `invalidateQueries`: (1) it only actively refetches queries with a
 * live `useQuery` observer (default `refetchType: "active"`) — every read
 * here goes through `ensureQueryData` in a route `loader` instead, which
 * leaves no observer; and (2) even with `refetchType: "all"`, a query that
 * was populated during SSR and hydrated onto the client has no `queryFn`
 * attached client-side (functions don't survive dehydration), so the forced
 * refetch fails with "Missing queryFn" and the query just sits in an `error`
 * state — meanwhile `ensureQueryData` ignores both the invalidated flag and
 * the error status whenever cached data already exists, and keeps handing
 * back the stale value. Removing the entry instead means the next
 * `ensureQueryData` call — from the loader `router.invalidate()` reruns,
 * which always supplies a live `queryFn` — sees an empty cache and does a
 * real fetch, sidestepping both problems at once.
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
