import type { FastifyReply, FastifyRequest } from "fastify";

import {
	DISPUTE_STATUS,
	OPEN_DISPUTE_STATUS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";
import type {
	AdminDispute,
	DisputeStatus,
} from "@transaction-dispute-portal/shared";

import {
	findDisputeById,
	findDisputesForReview,
	recordDisputeStatusChange,
	resolveDispute,
} from "../../database/repository/index.js";
import type { DisputeReviewRow } from "../../database/repository/dispute.js";

import { publishDisputeUpdate } from "../../lib/notifier.js";

import type {
	ListDisputesForReviewRequest,
	ResolveDisputeRequest,
} from "./type.js";

const OPEN_STATUSES: readonly DisputeStatus[] = OPEN_DISPUTE_STATUS;

const toWire = (row: DisputeReviewRow): AdminDispute => ({
	id: row.id,
	user_id: row.user_id,
	transaction_id: row.transaction_id,
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
	const { status: statusFilter, order, page, limit } = request.query;

	const { rows, total } = await findDisputesForReview(
		request.server.connection,
		{ status: statusFilter, order, page, limit },
	);

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

/** `POST /v1/admin/disputes/:disputeId/resolve` — the reviewer decision path. */
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

	const alreadyClosed = () => {
		const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
		return reply
			.status(status)
			.send({ code, message: "This dispute has already been resolved." });
	};

	if (!OPEN_STATUSES.includes(dispute.status)) return alreadyClosed();

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
			fromStatus: dispute.status,
			toStatus: resolution,
			note,
		});

		return row;
	});

	if (!resolved) return alreadyClosed();

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
