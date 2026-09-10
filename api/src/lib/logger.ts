import type { FastifyLoggerOptions } from "fastify";

import pino from "pino";

import { env } from "./env.js";

type LoggerOptions = pino.LoggerOptions & FastifyLoggerOptions;

const base: LoggerOptions = {
	level: env.LOG_LEVEL,
	timestamp: pino.stdTimeFunctions.isoTime,
	formatters: { level: (label: string) => ({ level: label }) },
};

/** Pretty, colourised output in development; plain JSON everywhere else. */
const options: LoggerOptions =
	env.NODE_ENV === "development"
		? {
				...base,
				transport: {
					target: "pino-pretty",
					options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
				},
			}
		: base;

export const logger = pino(options);
