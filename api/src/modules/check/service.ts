import type { FastifyReply, FastifyRequest } from "fastify";

import { sql } from "drizzle-orm";

import {
	SERVER_STATUS,
	HTTP_RESPONSE_CODE,
} from "@transaction-dispute-portal/shared";

import { isShuttingDown } from "../../lib/shutdown.js";
import { withTimeout } from "../../lib/util.js";

import type { HealthzRequest, ReadyzRequest } from "./type.js";

const DATABASE_PROBE_TIMEOUT_MS = 2000;

/**
 * Liveness probe: confirms the process is up and not draining. Cheap — no I/O.
 */
export const healthz = async (
	_request: FastifyRequest<HealthzRequest>,
	reply: FastifyReply<HealthzRequest>,
): Promise<void> => {
	if (isShuttingDown()) {
		const { status, code } = HTTP_RESPONSE_CODE.SERVICE_UNAVAILABLE;
		return reply.status(status).send({
			code,
			message: "Server is shutting down.",
			data: { health: SERVER_STATUS.UNHEALTHY },
		});
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Server is alive.",
		data: { health: SERVER_STATUS.HEALTHY },
	});
};

/**
 * Readiness probe: ready (`200`) only when the process is not draining and the
 * database answers `select 1` within the probe budget; otherwise `503`. The
 * probe distinguishes only ready from not-ready, so the body stays flat —
 * slow-but-alive is a metrics concern, not a probe state.
 */
export const readyz = async (
	request: FastifyRequest<ReadyzRequest>,
	reply: FastifyReply<ReadyzRequest>,
): Promise<void> => {
	if (isShuttingDown()) {
		const { status, code } = HTTP_RESPONSE_CODE.SERVICE_UNAVAILABLE;
		return reply
			.status(status)
			.send({ code, message: "Server is shutting down." });
	}

	try {
		await withTimeout(
			request.server.connection.execute(sql`select 1`),
			DATABASE_PROBE_TIMEOUT_MS,
		);
	} catch {
		const { status, code } = HTTP_RESPONSE_CODE.SERVICE_UNAVAILABLE;
		return reply
			.status(status)
			.send({ code, message: "Database is unreachable." });
	}

	const { status, code } = HTTP_RESPONSE_CODE.OK;
	return reply.status(status).send({
		code,
		message: "Server is ready.",
		data: { uptimeSeconds: Math.floor(process.uptime()) },
	});
};
