import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./test/env.js";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		fileParallelism: false,
		globalSetup: ["./test/global-setup.ts"],
		hookTimeout: 30_000,
		testTimeout: 20_000,
		env: {
			NODE_ENV: "test",
			LOG_LEVEL: "error",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_SECRET:
				process.env.BETTER_AUTH_SECRET ??
				"test-better-auth-secret-that-is-at-least-32-chars",
			COOKIE_SECRET:
				process.env.COOKIE_SECRET ??
				"test-cookie-secret-that-is-at-least-32-chars-long",
			SMTP_HOST: process.env.SMTP_HOST ?? "localhost",
			SMTP_PORT: process.env.SMTP_PORT ?? "1025",
			NTFY_URL: process.env.MAILPIT_URL ?? "http://localhost:8025",
			RATE_LIMIT_MAX: "1000",
			RATE_LIMIT_WINDOW: "60",
		},
	},
});
