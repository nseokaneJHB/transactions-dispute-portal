import type { FastifyInstance } from "fastify";

import {
	validatorCompiler,
	serializerCompiler,
} from "fastify-type-provider-zod";

import { HTTP_RESPONSE_CODE } from "@transaction-dispute-portal/shared";

import { error } from "./error.js";
import { authorize } from "./authorize.js";
import { authenticate } from "./authenticate.js";
import { onRequestTimerHook, onResponseLoggingHook } from "./logging.js";

import { env } from "../lib/env.js";
import { connection, close } from "../database/config.js";

/** Register every cross-cutting plugin, hook, and decorator on the app. */
export const middlewares = async (app: FastifyInstance): Promise<void> => {
	await app.register(import("@fastify/helmet"), {
		contentSecurityPolicy: {
			directives: {
				scriptSrc: ["'self'"],
				defaultSrc: ["'self'"],
				connectSrc: ["'self'"],
				imgSrc: ["'self'", "data:", "https:"],
				styleSrc: ["'self'", "'unsafe-inline'"],
			},
		},
	});

	await app.register(import("@fastify/cors"), {
		credentials: true,
		origin: env.CORS_ORIGIN,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	});

	await app.register(import("@fastify/rate-limit"), {
		global: true,
		skipOnError: false,
		max: env.RATE_LIMIT_MAX,
		timeWindow: env.RATE_LIMIT_WINDOW * 1000,
	});

	const isProduction = env.NODE_ENV === "production";

	await app.register(import("@fastify/cookie"), {
		secret: env.COOKIE_SECRET,
		parseOptions: {
			path: "/",
			httpOnly: true,
			secure: isProduction,
			sameSite: isProduction ? "strict" : "lax",
		},
	});

	app.setErrorHandler(error);
	app.setNotFoundHandler((request, reply) => {
		const { status, code } = HTTP_RESPONSE_CODE.NOT_FOUND;
		return reply.status(status).send({
			code,
			message: `Route ${request.method} ${request.url} does not exist.`,
		});
	});
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.addHook("onRequest", onRequestTimerHook);
	app.addHook("onResponse", onResponseLoggingHook);

	app.decorate("authenticate", authenticate);
	app.decorate("authorize", authorize);
	app.decorate("connection", connection);
	app.addHook("onClose", async () => {
		await close();
	});
};
