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

/** Liveness probe — the process is up and not draining. */
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

/** Readiness probe — `200` only if not draining and the database answers in time. */
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
