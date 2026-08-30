import type { connection } from "./config.js";

type Transaction = Parameters<
	Parameters<(typeof connection)["transaction"]>[0]
>[0];

/**
 * The pooled Drizzle connection or an open transaction handle. Repository
 * functions take either as their first argument, so the same query runs
 * inside or outside `connection.transaction(...)`.
 */
export type Executor = typeof connection | Transaction;
