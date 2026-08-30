import { z } from "zod";

import {
	transactionSchema,
	transactionsQuerySchema,
	transactionResponseSchema,
	transactionListResponseSchema,
} from "../schema/transaction.js";

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;

export type Transaction = z.infer<typeof transactionSchema>;

export type TransactionResponse = z.infer<typeof transactionResponseSchema>;

export type TransactionListResponse = z.infer<
	typeof transactionListResponseSchema
>;
