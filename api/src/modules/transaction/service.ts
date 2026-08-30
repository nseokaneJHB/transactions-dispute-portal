import type { FastifyReply, FastifyRequest } from "fastify";

import { endOfDay, parseISO, startOfDay } from "date-fns";

import { HTTP_RESPONSE_CODE } from "@transaction-dispute-portal/shared";
import type { Transaction } from "@transaction-dispute-portal/shared";

import {
	findTransactionsByUser,
	findUserTransactionById,
} from "../../database/repository/index.js";
import type { TransactionRow } from "../../database/repository/transaction.js";

import type {
	GetTransactionRequest,
	ListTransactionsRequest,
} from "./type.js";

const toWire = (row: TransactionRow): Transaction => ({
	id: row.id,
	amount_cents: row.amount_cents,
	merchant_name: row.merchant_name,
	transacted_at: row.transacted_at.toISOString(),
	created_at: row.created_at.toISOString(),
	updated_at: row.updated_at.toISOString(),
});

/** `GET /v1/transactions` — a page of the caller's own transactions. */
export const listTransactions = async (
	request: FastifyRequest<ListTransactionsRequest>,
	reply: FastifyReply<ListTransactionsRequest>,
): Promise<void> => {
	const { from, to, order, page, limit } = request.query;

	const { rows, total } = await findTransactionsByUser(
		request.server.connection,
		{
			order,
			page,
			limit,
			userId: request.user!.id,
			from: from ? startOfDay(parseISO(from)) : undefined,
			to: to ? endOfDay(parseISO(to)) : undefined,
		},
	);

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		page,
		limit,
		count: total,
		total: rows.length,
		message: "Transactions retrieved.",
		data: rows.map(toWire),
	});
};

/** `GET /v1/transactions/:transactionId` — one transaction, scoped to the caller. */
export const getTransaction = async (
	request: FastifyRequest<GetTransactionRequest>,
	reply: FastifyReply<GetTransactionRequest>,
): Promise<void> => {
	const row = await findUserTransactionById(request.server.connection, {
		id: request.params.transactionId,
		userId: request.user!.id,
	});

	if (!row) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply
			.status(status)
			.send({ code, message: "Transaction not found." });
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Transaction retrieved.",
		data: toWire(row),
	});
};
