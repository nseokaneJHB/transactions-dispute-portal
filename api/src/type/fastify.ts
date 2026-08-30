import "fastify";
import type { preHandlerHookHandler } from "fastify";

import type { Role } from "@transaction-dispute-portal/shared";

import type { UserModelSelect, SessionModelSelect } from "../database/schema/index.js";

import type { connection } from "../database/config.js";

declare module "fastify" {
	interface FastifyInstance {
		authenticate: preHandlerHookHandler;
		authorize: (roles: Role | Role[]) => preHandlerHookHandler;

		connection: typeof connection;
	}

	interface FastifyRequest {
		startTime?: bigint;
		user: UserModelSelect | null;
		session: SessionModelSelect | null;
	}
}
