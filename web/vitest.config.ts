import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		env: {
			VITE_API_URL: "http://localhost:8080",
			VITE_API_VERSION: "v1",
			VITE_NTFY_URL: "http://localhost:8090",
			SERVER_API_URL: "http://api:8080",
		},
	},
});
