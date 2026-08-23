import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/database/schema",
	out: "./src/database/migrations",
	strict: true,
	verbose: true,
	dbCredentials: {
		url: process.env.DATABASE_URL as string,
	},
});
