import { z } from "zod";

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
		.regex(/^\d{6}$/, "The sign-in code is 6 digits.")
		.describe("The 6-digit code from the sign-in email"),
});
