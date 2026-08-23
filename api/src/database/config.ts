import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

interface GlobalSetup {
	close: () => Promise<void>;
	client: ReturnType<typeof postgres>;
	connection: ReturnType<typeof drizzle>;
}

// Singleton on globalThis — `tsx watch` hot-reloads this module on every
// save, and a naive `postgres()` call here would open a fresh connection
// each reload until the pool is exhausted.
const global = globalThis as unknown as GlobalSetup;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL is not set");
}

const isProduction = process.env.NODE_ENV === "production";

const createClient = (): ReturnType<typeof postgres> =>
	global.client ??
	postgres(connectionString, {
		prepare: false,
		idle_timeout: 30,
		connect_timeout: 10,
		max: isProduction ? 10 : 1,
	});

const initializeDatabase = (): GlobalSetup => {
	const client = createClient();
	return {
		client,
		close: async () => await client.end(),
		connection: drizzle(client, { schema }),
	};
};

let databaseInstance: GlobalSetup;

if (isProduction) {
	databaseInstance = initializeDatabase();
} else if (!global.client || !global.connection) {
	databaseInstance = initializeDatabase();
	global.close = databaseInstance.close;
	global.client = databaseInstance.client;
	global.connection = databaseInstance.connection;
} else {
	databaseInstance = {
		close: global.close,
		client: global.client,
		connection: global.connection,
	};
}

export const { close, client, connection } = databaseInstance;
