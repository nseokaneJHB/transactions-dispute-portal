import type { RouteGenericInterface } from "fastify";

import type {
	UuidParams,
	GlobalResponse,
	TransactionsQuery,
	TransactionResponse,
	TransactionListResponse,
} from "@transaction-dispute-portal/shared";

export interface ListTransactionsRequest extends RouteGenericInterface {
	Querystring: TransactionsQuery;
	Reply: TransactionListResponse | GlobalResponse;
}

export interface GetTransactionRequest extends RouteGenericInterface {
	Params: UuidParams<"transactionId">;
	Reply: TransactionResponse | GlobalResponse;
}
