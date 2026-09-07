import { QueryClient } from "@tanstack/react-query";

/** A fresh client per request on SSR; per tab on the client. */
export const createQueryClient = (): QueryClient =>
	new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				staleTime: 1000 * 30,
			},
		},
	});
