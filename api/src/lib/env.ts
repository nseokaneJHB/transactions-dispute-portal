import { z } from "zod";

const envSchema = z.object({
	PORT: z.string().default("8080").transform(Number),
	API_URL: z.string().default("http://localhost:8080"),
	FRONTEND_URL: z.string().default("http://localhost:3000"),
	LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	API_VERSION: z
		.string()
		.regex(/^v\d+$/, "API_VERSION must follow the 'vX' format (e.g. v1)")
		.default("v1"),

	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

	CORS_ORIGIN: z
		.string()
		.default("http://localhost:3000")
		.transform((value) =>
			value
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		),

	BETTER_AUTH_SECRET: z
		.string()
		.min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
	COOKIE_SECRET: z
		.string()
		.min(32, "COOKIE_SECRET must be at least 32 characters"),

	RATE_LIMIT_MAX: z.string().default("100").transform(Number),
	RATE_LIMIT_WINDOW: z.string().default("60").transform(Number),

	NTFY_URL: z.string().default("http://ntfy"),

	SMTP_HOST: z.string().default("mailpit"),
	SMTP_PORT: z.string().default("1025").transform(Number),
	SMTP_USER: z.string().default(""),
	SMTP_PASS: z.string().default(""),
	SMTP_FROM: z.string().default("noreply@transaction-dispute-portal.local"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate `process.env` once, exiting on failure.
 *
 * @returns The validated, typed environment object.
 */
const loadEnv = (): Env => {
	if (_env) return _env;

	const parsed = envSchema.safeParse(process.env);

	if (!parsed.success) {
		console.error("❌ Invalid environment variables:");
		for (const issue of parsed.error.issues) {
			console.error(`  - [${String(issue.path[0])}]: ${issue.message}`);
		}
		process.exit(1);
	}

	_env = parsed.data;
	return _env;
};

export const env = loadEnv();
