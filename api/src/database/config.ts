import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";

interface GlobalSetup {
	close: () => Promise<void>;
	client: ReturnType<typeof postgres>;
	connection: ReturnType<typeof drizzle>;
}

const global = globalThis as unknown as GlobalSetup;

const isTesting = env.NODE_ENV === "test";
const isProduction = env.NODE_ENV === "production";

/**
 * Return the process-wide postgres client, creating it on first call.
 *
 * @returns A pooled postgres-js client.
 */
const createClient = (): ReturnType<typeof postgres> =>
	global.client ??
	postgres(env.DATABASE_URL, {
		prepare: false,
		idle_timeout: 30,
		connect_timeout: 10,
		max: isProduction ? 10 : 1,
	});

/**
 * Build the client plus its Drizzle connection and a matching close handler.
 *
 * @returns The client, the Drizzle connection, and a close function.
 */
const initializeDatabase = (): GlobalSetup => {
	const client = createClient();
	return {
		client,
		close: async () => await client.end(),
		connection: drizzle(client, {
			schema,
			casing: "snake_case",
			logger: !isProduction && !isTesting,
		}),
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
