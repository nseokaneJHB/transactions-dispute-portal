import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

const migrationClient = postgres(connectionString, { max: 1, onnotice: () => {} });

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
