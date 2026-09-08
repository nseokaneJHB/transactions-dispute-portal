import postgres from "postgres";

import { runMigrations } from "../src/database/migrate.js";

import { testDatabaseUrl } from "./env.js";

/** Create the target database on the server if it doesn't exist yet, connecting via the server's default `postgres` database. */
const ensureDatabaseExists = async (connectionString: string): Promise<void> => {
	const target = new URL(connectionString);
	const databaseName = target.pathname.replace(/^\//, "");

	const maintenanceUrl = new URL(connectionString);
	maintenanceUrl.pathname = "/postgres";

	const client = postgres(maintenanceUrl.toString(), { max: 1, onnotice: () => {} });

	const [existing] =
		await client`select 1 from pg_database where datname = ${databaseName}`;

	if (!existing) {
		await client.unsafe(`create database "${databaseName}"`);
	}

	await client.end();
};

/** Vitest `globalSetup`: make sure the test database exists and is migrated before any test file runs. Safe to run against an already-migrated database (drizzle tracks what's applied). */
export default async function setup(): Promise<void> {
	await ensureDatabaseExists(testDatabaseUrl);
	await runMigrations(testDatabaseUrl);
}
