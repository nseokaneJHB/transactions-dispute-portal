import type { FastifyLoggerOptions } from "fastify";

import pino from "pino";

import { env } from "./env.js";

type LoggerConfig = Record<
	"development" | "test" | "production",
	pino.LoggerOptions & FastifyLoggerOptions
>;

const formatters = {
	level: (label: string) => ({ level: label }),
};

const loggerConfig: LoggerConfig = {
	development: {
		formatters,
		level: env.LOG_LEVEL,
		timestamp: pino.stdTimeFunctions.isoTime,
		transport: {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:HH:MM:ss",
			},
		},
	},
	test: {
		formatters,
		level: env.LOG_LEVEL,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	production: {
		formatters,
		level: env.LOG_LEVEL,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
};

export const config = loggerConfig[env.NODE_ENV] ?? loggerConfig.production;

export const logger = pino(config);
