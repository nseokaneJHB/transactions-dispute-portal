// Standalone migration runner — never imported by app.ts. Applies
// already-generated SQL under src/database/migrations with drizzle-orm's
// runtime migrator, so it works from the production image (drizzle-kit is
// a devDependency and isn't present there). Run it as its own step, before
// the API starts or independently of whether it's running at all:
//   dev:  pnpm --filter @transaction-dispute-portal/api migrate
//   prod: node dist/database/migrate.js   (compiled output, same as `node dist/app.js`)
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

// max: 1 — a migration run needs one connection, not the app's pool
// (api/src/database/config.ts's singleton is for the running API, not this).
const migrationClient = postgres(connectionString, { max: 1 });

const run = async () => {
	await migrate(drizzle(migrationClient), {
		migrationsFolder: "./src/database/migrations",
	});
	await migrationClient.end();
};

run()
	.then(() => {
		console.log("Migrations applied");
		process.exit(0);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
