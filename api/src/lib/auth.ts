import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { USER_ROLE } from "@transaction-dispute-portal/shared";

import * as schema from "../database/schema/index.js";

import { buildOtpEmailSignInRequest } from "../email/otp-email-sign-in-request.js";

import { connection } from "../database/config.js";
import { env } from "./env.js";
import { sendEmail } from "./mailer.js";
import { generateUuid } from "./util.js";

const OTP_EXPIRATION_SECONDS = 60 * 10;
const OTP_MAX_ATTEMPTS = 5;

export const auth = betterAuth({
	baseURL: env.API_URL,
	secret: env.BETTER_AUTH_SECRET,
	basePath: `/${env.API_VERSION}/auth`,
	trustedOrigins: env.CORS_ORIGIN,

	database: drizzleAdapter(connection, {
		provider: "pg",
		usePlural: false,
		schema: {
			user: schema.UserModel,
			account: schema.AccountModel,
			session: schema.SessionModel,
			verification: schema.VerificationModel,
		},
	}),

	emailAndPassword: { enabled: false },

	user: {
		modelName: "user",
		fields: {
			id: "id",
			name: "name",
			email: "email",
			image: "image",
			createdAt: "created_at",
			updatedAt: "updated_at",
			emailVerified: "email_verified",
		},
		additionalFields: {
			role: {
				input: false,
				type: "string",
				required: false,
				defaultValue: USER_ROLE.CUSTOMER,
			},
		},
	},

	account: {
		modelName: "account",
		fields: {
			id: "id",
			scope: "scope",
			issuer: "issuer",
			userId: "user_id",
			idToken: "id_token",
			password: "password",
			accountId: "account_id",
			createdAt: "created_at",
			updatedAt: "updated_at",
			providerId: "provider_id",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			accessTokenExpiresAt: "access_token_expires_at",
			refreshTokenExpiresAt: "refresh_token_expires_at",
		},
	},

	session: {
		modelName: "session",
		fields: {
			id: "id",
			token: "token",
			userId: "user_id",
			createdAt: "created_at",
			updatedAt: "updated_at",
			expiresAt: "expires_at",
			ipAddress: "ip_address",
			userAgent: "user_agent",
		},
	},

	verification: {
		modelName: "verification",
		fields: {
			id: "id",
			value: "value",
			createdAt: "created_at",
			updatedAt: "updated_at",
			expiresAt: "expires_at",
			identifier: "identifier",
		},
	},

	plugins: [
		emailOTP({
			otpLength: 6,
			storeOTP: "hashed",
			disableSignUp: true,
			expiresIn: OTP_EXPIRATION_SECONDS,
			allowedAttempts: OTP_MAX_ATTEMPTS,
			sendVerificationOTP: async ({ email, otp }) => {
				await sendEmail(
					buildOtpEmailSignInRequest({
						otp,
						email,
						expiresInMinutes: OTP_EXPIRATION_SECONDS / 60,
					}),
				);
			},
		}),
	],

	rateLimit: { enabled: false },

	advanced: {
		cookiePrefix: "transaction-dispute-portal",
		database: {
			generateId: () => generateUuid(),
		},
		defaultCookieAttributes: {
			path: "/",
			httpOnly: true,
			secure: env.NODE_ENV === "production",
			sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
		},
	},
});
