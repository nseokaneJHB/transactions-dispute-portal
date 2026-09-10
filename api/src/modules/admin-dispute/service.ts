import type { FastifyReply, FastifyRequest } from "fastify";

import {
	DISPUTE_STATUS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";
import type { AdminDispute } from "@transaction-dispute-portal/shared";

import {
	countDisputesByStatus,
	findDisputeById,
	findDisputesForReview,
	markDisputeUnderReview,
	recordDisputeStatusChange,
	resolveDispute,
} from "../../database/repository/index.js";
import type { AdminDisputeRow } from "../../database/repository/dispute.js";

import { publishDisputeUpdate } from "../../lib/notifier.js";
import { paginatedResponse } from "../../lib/paginated-response.js";

import type {
	GetDisputeSummaryRequest,
	ListDisputesForReviewRequest,
	ResolveDisputeRequest,
	StartDisputeReviewRequest,
} from "./type.js";

const toWire = (row: AdminDisputeRow): AdminDispute => ({
	id: row.id,
	user_id: row.user_id,
	transaction_id: row.transaction_id,
	transaction: {
		merchant_name: row.transaction.merchant_name,
		amount_cents: row.transaction.amount_cents,
		transacted_at: row.transaction.transacted_at.toISOString(),
	},
	customer: {
		name: row.customer.name,
		email: row.customer.email,
	},
	status: row.status,
	reason: row.reason,
	description: row.description,
	resolution_note: row.resolution_note,
	resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
	created_at: row.created_at.toISOString(),
	updated_at: row.updated_at.toISOString(),
});

/** `GET /v1/admin/disputes` — a page of every customer's disputes, for the review queue. */
export const listDisputesForReview = async (
	request: FastifyRequest<ListDisputesForReviewRequest>,
	reply: FastifyReply<ListDisputesForReviewRequest>,
): Promise<void> => {
	const { rows, total } = await findDisputesForReview(
		request.server.connection,
		request.query,
	);

	return reply.status(HTTP_RESPONSE_CODE.OK.status).send(
		paginatedResponse({
			query: request.query,
			total,
			rows: rows.map(toWire),
			message: "Disputes retrieved.",
		}),
	);
};

/** `GET /v1/admin/disputes/summary` — how many disputes sit in each status right now, for the queue's stat cards. */
export const getDisputeSummary = async (
	request: FastifyRequest<GetDisputeSummaryRequest>,
	reply: FastifyReply<GetDisputeSummaryRequest>,
): Promise<void> => {
	const counts = await countDisputesByStatus(request.server.connection);

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Dispute summary retrieved.",
		data: counts,
	});
};

/** `POST /v1/admin/disputes/:disputeId/review` — move a submitted dispute to `UNDER_REVIEW`. */
export const startDisputeReview = async (
	request: FastifyRequest<StartDisputeReviewRequest>,
	reply: FastifyReply<StartDisputeReviewRequest>,
): Promise<void> => {
	const { disputeId } = request.params;
	const reviewerId = request.user!.id;

	const dispute = await findDisputeById(request.server.connection, {
		id: disputeId,
	});

	if (!dispute) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply.status(status).send({ code, message: "Dispute not found." });
	}

	if (dispute.status === DISPUTE_STATUS.UNDER_REVIEW) {
		const { status, code } = HTTP_RESPONSE_CODE.OK;
		return reply.status(status).send({
			code,
			message: "Dispute is already under review.",
			data: toWire(dispute),
		});
	}

	if (dispute.status !== DISPUTE_STATUS.SUBMITTED) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This dispute is already closed." });
	}

	const reviewed = await request.server.connection.transaction(async (tx) => {
		const row = await markDisputeUnderReview(tx, { id: disputeId });
		if (!row) return undefined;

		await recordDisputeStatusChange(tx, {
			disputeId,
			actorId: reviewerId,
			fromStatus: DISPUTE_STATUS.SUBMITTED,
			toStatus: DISPUTE_STATUS.UNDER_REVIEW,
			note: "Moved to review by the reviewer.",
		});

		return {
			...row,
			transaction: dispute.transaction,
			customer: dispute.customer,
		};
	});

	if (!reviewed) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This dispute is no longer awaiting review." });
	}

	await publishDisputeUpdate(reviewed.user_id, reviewed.status);

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Dispute moved to review.",
		data: toWire(reviewed),
	});
};

/** `POST /v1/admin/disputes/:disputeId/resolve` — close a dispute that is under review. */
export const resolveDisputeForReview = async (
	request: FastifyRequest<ResolveDisputeRequest>,
	reply: FastifyReply<ResolveDisputeRequest>,
): Promise<void> => {
	const { disputeId } = request.params;
	const { resolution, note } = request.body;
	const reviewerId = request.user!.id;

	const dispute = await findDisputeById(request.server.connection, {
		id: disputeId,
	});

	if (!dispute) {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply.status(status).send({ code, message: "Dispute not found." });
	}

	if (dispute.status === DISPUTE_STATUS.SUBMITTED) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply.status(status).send({
			code,
			message: "This dispute must be moved to review before it can be resolved.",
		});
	}

	if (dispute.status !== DISPUTE_STATUS.UNDER_REVIEW) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This dispute is already closed." });
	}

	const resolved = await request.server.connection.transaction(async (tx) => {
		const row = await resolveDispute(tx, {
			id: disputeId,
			status: resolution,
			note,
			resolvedBy: reviewerId,
		});
		if (!row) return undefined;

		await recordDisputeStatusChange(tx, {
			disputeId,
			actorId: reviewerId,
			fromStatus: DISPUTE_STATUS.UNDER_REVIEW,
			toStatus: resolution,
			note,
		});

		return {
			...row,
			transaction: dispute.transaction,
			customer: dispute.customer,
		};
	});

	if (!resolved) {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This dispute is already closed." });
	}

	await publishDisputeUpdate(resolved.user_id, resolved.status);

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message:
			resolution === DISPUTE_STATUS.RESOLVED
				? "Dispute resolved."
				: "Dispute rejected.",
		data: toWire(resolved),
	});
};
