import { z } from "zod";

import {
	authSessionSchema,
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
	authSessionResponseSchema,
	authChangeEmailBodySchema,
	authChangeEmailConfirmBodySchema,
} from "../schema/authentication.js";

export type AuthSession = z.infer<typeof authSessionSchema>;

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export type AuthOtpRequestBody = z.infer<typeof authOtpRequestBodySchema>;

export type AuthOtpVerifyBody = z.infer<typeof authOtpVerifyBodySchema>;

export type AuthChangeEmailBody = z.infer<typeof authChangeEmailBodySchema>;

export type AuthChangeEmailConfirmBody = z.infer<
	typeof authChangeEmailConfirmBodySchema
>;
