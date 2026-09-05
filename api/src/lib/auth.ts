import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import {
	OTP,
	USER_ROLE,
	API_URLS,
	FRONTEND_URLS,
	EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES,
} from "@transaction-dispute-portal/shared";

import * as schema from "../database/schema/index.js";

import { buildOtpEmailSignInRequest } from "../email/otp-email-sign-in-request.js";
import { buildEmailVerificationEmail } from "../email/email-verification.js";
import { buildEmailChangeApprovalEmail } from "../email/email-change-approval.js";

import { connection } from "../database/config.js";
import { env } from "./env.js";
import { sendEmail } from "./mailer.js";
import { alertOnNewDeviceLogin } from "./security-notifications.js";
import { generateUuid } from "./util.js";

const OTP_EXPIRATION_SECONDS = OTP.EXPIRY_MINUTES * 60;
const EMAIL_CHANGE_TOKEN_EXPIRATION_SECONDS =
	EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES * 60;

const emailChangeUrl = (token: string): string =>
	`${env.FRONTEND_URL}${FRONTEND_URLS.CONFIRM_EMAIL_CHANGE}?${new URLSearchParams(
		{ token },
	).toString()}`;

export const auth = betterAuth({
	baseURL: env.API_URL,
	secret: env.BETTER_AUTH_SECRET,
	basePath: API_URLS(env.API_VERSION).AUTH,
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

	emailVerification: {
		expiresIn: EMAIL_CHANGE_TOKEN_EXPIRATION_SECONDS,
		sendVerificationEmail: async ({ user, token }) => {
			await sendEmail(
				buildEmailVerificationEmail({
					to: user.email,
					verifyUrl: emailChangeUrl(token),
					expiresInMinutes: EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES,
				}),
			);
		},
	},

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
				type: Object.values(USER_ROLE),
				defaultValue: USER_ROLE.CUSTOMER,
			},
		},
		changeEmail: {
			enabled: true,
			sendChangeEmailConfirmation: async ({ user, newEmail, token }) => {
				await sendEmail(
					buildEmailChangeApprovalEmail({
						to: user.email,
						newEmail,
						approveUrl: emailChangeUrl(token),
						expiresInMinutes: EMAIL_CHANGE_TOKEN_EXPIRY_MINUTES,
					}),
				);
			},
		},
	},

	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					void alertOnNewDeviceLogin(session).catch((error) => {
						console.error("Failed to run new-device login alert:", error);
					});
				},
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
			storeOTP: "hashed",
			disableSignUp: true,
			otpLength: OTP.LENGTH,
			expiresIn: OTP_EXPIRATION_SECONDS,
			allowedAttempts: OTP.MAX_ATTEMPTS,
			sendVerificationOTP: async ({ email, otp }) => {
				await sendEmail(
					buildOtpEmailSignInRequest({
						otp,
						email,
						expiresInMinutes: OTP.EXPIRY_MINUTES,
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
