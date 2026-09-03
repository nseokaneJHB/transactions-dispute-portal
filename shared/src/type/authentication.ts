import { z } from "zod";

import {
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
} from "../schema/authentication.js";

export type AuthOtpRequestBody = z.infer<typeof authOtpRequestBodySchema>;

export type AuthOtpVerifyBody = z.infer<typeof authOtpVerifyBodySchema>;
