import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

import { APIError } from "better-auth";
import { DrizzleQueryError } from "drizzle-orm/errors";

import {
	HTTP_CODE,
	HTTP_RESPONSE_CODE,
	type GlobalResponse,
} from "@transaction-dispute-portal/shared";

const CODE_BY_STATUS = new Map(
	Object.values(HTTP_RESPONSE_CODE).map(({ status, code }) => [status, code]),
);

/** The postgres-js driver error Drizzle nests under `DrizzleQueryError.cause`. */
interface PostgresDriverError extends Error {
	code?: string;
	detail?: string;
	constraint_name?: string;
}

/** Friendly 409 copy per unique constraint; falls back to a generic message. */
const CONFLICT_MESSAGE: Record<string, string> = {
	dispute_open_per_transaction_uq_idx:
		"This transaction already has an open dispute.",
};

/** Central error handler — maps known errors onto the shared response envelope. */
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

	if (error instanceof APIError) {
		const { status, code } = HTTP_RESPONSE_CODE.BAD_REQUEST;
		return reply.status(status).send({ code, message: error.message });
	}

	if (error instanceof DrizzleQueryError) {
		const driverError = error.cause as PostgresDriverError | undefined;

		if (driverError?.code === "23505") {
			const { status, code } = HTTP_RESPONSE_CODE.CONFLICT;
			return reply.status(status).send({
				code,
				message:
					CONFLICT_MESSAGE[driverError.constraint_name ?? ""] ??
					"That conflicts with a record that already exists.",
			});
		}
	}

	const { statusCode } = error;
	if (statusCode && statusCode >= 400 && statusCode < 500) {
		return reply.status(statusCode).send({
			code: CODE_BY_STATUS.get(statusCode) ?? HTTP_CODE.BAD_REQUEST,
			message:
				statusCode === 429
					? "Too many requests. Please slow down and try again shortly."
					: error.message,
		});
	}

	request.log.error({ err: error }, "Unhandled error");

	const { status, code } = HTTP_RESPONSE_CODE.INTERNAL_SERVER_ERROR;
	return reply
		.status(status)
		.send({ code, message: "An internal server error occurred." });
};
