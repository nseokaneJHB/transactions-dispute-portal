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
