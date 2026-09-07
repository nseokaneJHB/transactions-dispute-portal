import { z } from "zod";

import { OTP } from "../constant.js";

import {
	booleanSchema,
	emailSchema,
	roleSchema,
	stringSchema,
	uuidSchema,
} from "./field.js";
import { globalResponseSchema } from "./global.js";

/**
 * Body for `POST /v1/auth/otp` — request a one-time sign-in code by email.
 */
export const authOtpRequestBodySchema = z.object({
	email: emailSchema,
});

/**
 * Body for `POST /v1/auth/otp/verify` — exchange the emailed code for a session.
 */
export const authOtpVerifyBodySchema = z.object({
	email: emailSchema,
	otp: stringSchema
		.regex(
			new RegExp(`^\\d{${OTP.LENGTH}}$`),
			`The sign-in code is ${OTP.LENGTH} digits.`,
		)
		.describe(`The ${OTP.LENGTH}-digit code from the sign-in email`),
});

/**
 * The signed-in user on the wire — what `GET /v1/auth/session` returns so the
 * client can gate routes and pick the customer vs. admin UI without probing a
 * protected endpoint. Field names mirror the `user` table's columns.
 */
export const authSessionSchema = z.object({
	id: uuidSchema,
	name: stringSchema.describe("The user's display name"),
	email: emailSchema,
	role: roleSchema,
	email_verified: booleanSchema.describe("Whether the email is verified"),
	created_at: stringSchema.describe("When the account was created (ISO 8601)"),
	updated_at: stringSchema.describe("When the account last changed (ISO 8601)"),
});

/** Response for `GET /v1/auth/session`. */
export const authSessionResponseSchema = globalResponseSchema.extend({
	data: authSessionSchema,
});

/**
 * Body for `POST /v1/auth/change-email` — the signed-in user asks to move their
 * sign-in email. An approval link goes to the current address first.
 */
export const authChangeEmailBodySchema = z.object({
	newEmail: emailSchema,
});

/**
 * Body for `POST /v1/auth/change-email/confirm` — a token from either the
 * approval email (old address) or the verification email (new address).
 */
export const authChangeEmailConfirmBodySchema = z.object({
	token: stringSchema.min(1, "A confirmation token is required."),
});
