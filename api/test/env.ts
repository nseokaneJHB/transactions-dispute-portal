/**
 * A dedicated local test database — never the dev stack's own `transaction-dispute`
 * DB, which `docker compose` and the seeded demo data live in. Running the suite
 * locally used to point straight at that database via `localhost` instead of the
 * dev stack's Docker-network hostname, so `pnpm test` outside `docker compose`
 * silently truncated and reseeded the dev data with minimal test fixtures.
 */
const LOCAL_DATABASE_URL =
	"postgresql://postgres:password@localhost:5432/transaction-dispute-test";

export const testDatabaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
