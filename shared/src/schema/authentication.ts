import { z } from "zod";

import { OTP } from "../constant.js";

import { emailSchema, stringSchema } from "./field.js";

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
