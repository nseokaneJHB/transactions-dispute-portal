import { z } from "zod";

import {
	HTTP_CODE,
	ORDER_DIRECTION,
	SERVER_STATUS,
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
