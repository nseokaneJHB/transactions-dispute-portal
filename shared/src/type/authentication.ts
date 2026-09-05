import { z } from "zod";

import {
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
	authChangeEmailBodySchema,
	authChangeEmailConfirmBodySchema,
} from "../schema/authentication.js";

export type AuthOtpRequestBody = z.infer<typeof authOtpRequestBodySchema>;

export type AuthOtpVerifyBody = z.infer<typeof authOtpVerifyBodySchema>;

export type AuthChangeEmailBody = z.infer<typeof authChangeEmailBodySchema>;

export type AuthChangeEmailConfirmBody = z.infer<
	typeof authChangeEmailConfirmBodySchema
>;
