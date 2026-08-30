import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Truncate every table in the `public` schema except Drizzle's migration
 * ledger, resetting identities and cascading through foreign keys. Leaves the
 * schema itself (and applied migrations) intact — run `migrate` is not needed
 * afterwards, only `seed`.
 */
const purge = async (): Promise<void> => {
	const sql = postgres(connectionString, { max: 1, prepare: false });

	try {
		const tables = await sql<{ tablename: string }[]>`
			select tablename
			from pg_tables
			where schemaname = 'public'
			and tablename <> ${MIGRATIONS_TABLE}
			order by tablename
		`;

		if (tables.length === 0) {
			console.log("No tables to purge.");
			return;
		}

		const names = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
		await sql.unsafe(`truncate table ${names} restart identity cascade`);

		console.log(`Purged ${tables.length} tables.`);
	} finally {
		await sql.end();
	}
};

purge()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
