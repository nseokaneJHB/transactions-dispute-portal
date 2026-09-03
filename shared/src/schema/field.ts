import { z } from "zod";

import {
	DISPUTE_REASON,
	DISPUTE_STATUS,
	HTTP_CODE,
	ORDER_DIRECTION,
	SERVER_STATUS,
	TERMINAL_DISPUTE_STATUS,
	USER_ROLE,
} from "../constant.js";

import { stringToTitleCase } from "../util.js";

z.config({
	customError: (issue) => {
		const path = issue.path ?? [];
		const fieldName =
			path.length > 0 ? String(path[path.length - 1]) : "Field";

		if (issue.code === "invalid_type") {
			return `${stringToTitleCase(fieldName)} is required.`;
		}

		return undefined;
	},
});

/**
 * Primitive field schemas reused across request/response schemas. Add more
 * here as concrete callers need them, not speculatively.
 */

export const stringSchema = z.string().trim().describe("Basic string");

export const numberSchema = z.number().describe("Basic number");

export const integerSchema = z.int().describe("Basic integer");

export const booleanSchema = z.boolean().describe("Basic boolean");

export const uuidSchema = z.uuid().trim().describe("Basic uuid");

export const emailSchema = z
	.email("Invalid email address")
	.max(255, "Email must not exceed 255 characters")
	.trim()
	.toLowerCase()
	.describe("Email address");

export const orderDirectionSchema = z
	.enum(ORDER_DIRECTION)
	.describe("Order direction for sorting");

export const httpCodeSchema = z
	.enum(HTTP_CODE)
	.describe("Standardized response code");

export const serverStatusSchema = z
	.enum(SERVER_STATUS)
	.describe("Server health status");

export const roleSchema = z.enum(USER_ROLE).describe("User's role");

export const disputeStatusSchema = z
	.enum(DISPUTE_STATUS)
	.describe("Dispute lifecycle status");

export const disputeReasonSchema = z
	.enum(DISPUTE_REASON)
	.describe("Why the customer is disputing the charge");

export const disputeResolutionSchema = z
	.enum(TERMINAL_DISPUTE_STATUS)
	.describe("The reviewer's decision — the terminal status to move the dispute to");

/**
 * Path-param schema for any route whose sole parameter is a single UUID —
 * `uuidParamsSchema("transactionId")` for `/transactions/:transactionId`,
 * `uuidParamsSchema("disputeId")` for `/disputes/:disputeId`, etc. Keeps the
 * "malformed id is a 422" contract identical across every detail route.
 */
export const uuidParamsSchema = <Key extends string>(key: Key) =>
	z.object({ [key]: uuidSchema } as Record<Key, typeof uuidSchema>);
