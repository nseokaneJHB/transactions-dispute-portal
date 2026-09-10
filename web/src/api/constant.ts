/** Query cache keys — one entry per resource, tuples so filters can be appended. */
export const QUERY_KEYS = {
	SESSION: ["session"],
	TRANSACTIONS: ["transactions"],
	TRANSACTION: ["transaction"],
	DISPUTES: ["disputes"],
	DISPUTE: ["dispute"],
	ADMIN_DISPUTES: ["admin", "disputes"],
	ADMIN_DISPUTE_SUMMARY: ["admin", "disputes", "summary"],
	ADMIN_INVITES: ["admin", "invites"],
} as const;
