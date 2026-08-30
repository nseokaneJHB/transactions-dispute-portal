import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

import { APIError } from "better-auth";

import {
	HTTP_RESPONSE_CODE,
	type GlobalResponse,
} from "@transaction-dispute-portal/shared";

/**
 * Central error handler. Maps the error classes we expect — schema validation,
 * Better Auth API errors, `@fastify/rate-limit`'s 429 — onto the shared response
 * envelope, and falls back to a logged `500` for anything unrecognized.
 */
export const error = async (
	error: FastifyError,
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	if (error.code === "FST_ERR_VALIDATION") {
		const { status, code } = HTTP_RESPONSE_CODE.VALIDATION_ERROR;
		const response: GlobalResponse = {
			code,
			message: "Validation error.",
			errors: error.validation?.map((issue) => ({
				field: String(issue.instancePath?.split("/")[1] || "body"),
				message: issue.message ?? "Invalid value.",
			})),
		};

		return reply.status(status).send(response);
	}

	if (error.statusCode === 429) {
		const { status, code } = HTTP_RESPONSE_CODE.TOO_MANY_REQUESTS;
		const response: GlobalResponse = {
			code,
			message: "Too many requests. Please slow down and try again shortly.",
		};

		return reply.status(status).send(response);
	}

	if (error instanceof APIError) {
		const { status, code } = HTTP_RESPONSE_CODE.BAD_REQUEST;
		const response: GlobalResponse = {
			code,
			message: error.message,
		};

		return reply.status(status).send(response);
	}

	request.log.error({ err: error }, "Unhandled error");

	const { status, code } = HTTP_RESPONSE_CODE.INTERNAL_SERVER_ERROR;
	const response: GlobalResponse = {
		code,
		message: "An internal server error occurred.",
	};

	return reply.status(status).send(response);
};
