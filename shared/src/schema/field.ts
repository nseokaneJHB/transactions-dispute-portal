import { z } from "zod";

import { HTTP_CODE, ORDER_DIRECTION } from "../constant.js";

/**
 * Primitive field schemas reused across request/response schemas — trimmed
 * to just what `./global.ts` needs. Add more here as concrete callers need
 * them, not speculatively.
 */

export const stringSchema = z.string().trim().describe("Basic string");

export const numberSchema = z.number().describe("Basic number");

export const orderDirectionSchema = z
	.enum(ORDER_DIRECTION)
	.describe("Order direction for sorting");

export const httpCodeSchema = z
	.enum(HTTP_CODE)
	.describe("Standardized response code");
