import { createEnv } from "@t3-oss/env-core";

import { z } from "zod";

/**
 * Validated frontend environment. `VITE_*` values are inlined into the client
 * bundle; `SERVER_API_URL` is read only inside `createServerFn` handlers so the
 * SSR runtime can reach the API over the Docker network rather than `localhost`.
 */
export const env = createEnv({
	server: {
		SERVER_API_URL: z.string().min(1),
	},
	client: {
		VITE_API_URL: z.string().min(1),
		VITE_API_VERSION: z.string().min(1),
		VITE_NTFY_URL: z.string().min(1),
	},
	clientPrefix: "VITE_",
	runtimeEnv: {
		...process.env,
		...import.meta.env,
	},
	emptyStringAsUndefined: true,
});
