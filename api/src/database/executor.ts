import type { connection } from "./config.js";

type Transaction = Parameters<
	Parameters<(typeof connection)["transaction"]>[0]
>[0];

/** The pooled Drizzle connection or an open transaction handle. */
export type Executor = typeof connection | Transaction;
