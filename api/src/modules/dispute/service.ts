import type { FastifyReply, FastifyRequest } from "fastify";

import {
	DISPUTE_STATUS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";
import type { Dispute } from "@transaction-dispute-portal/shared";

import {
	createDispute,
	findDisputesByUser,
	findUserDisputeById,
	findUserTransactionById,
	recordDisputeStatusChange,
} from "../../database/repository/index.js";
import type { DisputeRow } from "../../database/repository/dispute.js";

import type {
	GetDisputeRequest,
	ListDisputesRequest,
	SubmitDisputeRequest,
} from "./type.js";

const toWire = (row: DisputeRow): Dispute => ({
	id: row.id,
	transaction_id: row.transaction_id,
	status: row.status,
	reason: row.reason,
	description: row.description,
	resolution_note: row.resolution_note,
	resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
	created_at: row.created_at.toISOString(),
	updated_at: row.updated_at.toISOString(),
});

/** `POST /v1/disputes` — open a dispute on one of the caller's own transactions. */
export const submitDispute = async (
	request: FastifyRequest<SubmitDisputeRequest>,
	reply: FastifyReply<SubmitDisputeRequest>,
): Promise<void> => {
	const { transactionId, reason, description } = request.body;
	const userId = request.user!.id;

	const transaction = await findUserTransactionById(request.server.connection, {
		id: transactionId,
		userId,
	});

	if (!transaction) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply
			.status(status)
			.send({ code, message: "Transaction not found." });
	}

	const created = await request.server.connection.transaction(async (tx) => {
		const dispute = await createDispute(tx, {
			userId,
			transactionId,
			reason,
			description,
		});

		await recordDisputeStatusChange(tx, {
			disputeId: dispute.id,
			actorId: userId,
			toStatus: DISPUTE_STATUS.SUBMITTED,
			note: "Dispute opened by the customer.",
		});

		return dispute;
	});

	const { status, code } = HTTP_RESPONSE_CODE.CREATED;
	return reply.status(status).send({
		code,
		message: "Dispute opened.",
		data: toWire(created),
	});
};

/** `GET /v1/disputes` — a page of the caller's own disputes. */
export const listDisputes = async (
	request: FastifyRequest<ListDisputesRequest>,
	reply: FastifyReply<ListDisputesRequest>,
): Promise<void> => {
	const { status: statusFilter, order, page, limit } = request.query;

	const { rows, total } = await findDisputesByUser(request.server.connection, {
		userId: request.user!.id,
		status: statusFilter,
		order,
		page,
		limit,
	});

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		page,
		limit,
		count: total,
		total: rows.length,
		message: "Disputes retrieved.",
		data: rows.map(toWire),
	});
};

/** `GET /v1/disputes/:disputeId` — one dispute, scoped to the caller. */
export const getDispute = async (
	request: FastifyRequest<GetDisputeRequest>,
	reply: FastifyReply<GetDisputeRequest>,
): Promise<void> => {
	const row = await findUserDisputeById(request.server.connection, {
		id: request.params.disputeId,
		userId: request.user!.id,
	});

	if (!row) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply.status(status).send({ code, message: "Dispute not found." });
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Dispute retrieved.",
		data: toWire(row),
	});
};
