import type { FastifyReply, FastifyRequest } from "fastify";

import { API_PATHS } from "@transaction-dispute-portal/shared";

const CORRELATION_HEADER = "x-correlation-id";

const IGNORED_ROUTES: readonly string[] = [API_PATHS.HEALTHZ, API_PATHS.READYZ];

/** `onRequest`: stamp the start time and echo the correlation id on the response. */
export const onRequestTimerHook = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	request.startTime = process.hrtime.bigint();
	reply.header(CORRELATION_HEADER, request.id);
};

/** `onResponse`: emit one structured log line per request (health probes excepted). */
export const onResponseLoggingHook = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	if (IGNORED_ROUTES.includes(request.routeOptions.url ?? "")) return;

	let durationMs = 0;
	if (request.startTime) {
		durationMs = Number(process.hrtime.bigint() - request.startTime) / 1e6;
	}

	const { statusCode } = reply;
	const level =
		statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

	request.log[level](
		{
			data: {
				statusCode,
				method: request.method,
				url: request.url,
				route: request.routeOptions.url ?? "unknown",
				correlationId: request.id,
				durationMs: Number(durationMs.toFixed(2)),
			},
		},
		`HTTP ${request.method} ${request.routeOptions.url ?? request.url} → ${statusCode} (${durationMs.toFixed(2)}ms)`,
	);
};
