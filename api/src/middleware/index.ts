import type { FastifyInstance } from "fastify";

import {
	validatorCompiler,
	serializerCompiler,
} from "fastify-type-provider-zod";

import { error } from "./error.js";
import { notFound } from "./not-found.js";
import { authorize } from "./authorize.js";
import { authenticate } from "./authenticate.js";
import { onRequestTimerHook, onResponseLoggingHook } from "./logging.js";

import { env } from "../lib/env.js";
import { connection, close } from "../database/config.js";

/**
 * Register every cross-cutting plugin, hook, and decorator on the app, in
 * order: security plugins, zod compilers, the error handler, request
 * timing/logging hooks, and the `authenticate`/`authorize`/`connection`
 * decorators route modules rely on. The `connection` decorator is the pooled
 * Drizzle connection; repository functions take it (or a `tx`) as their first
 * argument.
 */
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
	app.setNotFoundHandler(notFound);
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
