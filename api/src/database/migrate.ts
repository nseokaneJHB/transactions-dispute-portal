import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Apply every migration in `src/database/migrations` to `connectionString`. Idempotent — drizzle tracks what's already applied. */
export const runMigrations = async (connectionString: string): Promise<void> => {
	const migrationClient = postgres(connectionString, { max: 1, onnotice: () => {} });

	await migrate(drizzle(migrationClient), {
		migrationsFolder: "./src/database/migrations",
	});
	await migrationClient.end();
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error("DATABASE_URL is not set");
	}

	runMigrations(connectionString)
		.then(() => {
			console.log("Migrations applied");
			process.exit(0);
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
