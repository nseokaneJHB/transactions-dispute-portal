import type { FastifyInstance } from "fastify";

import { build } from "../../src/build.js";

/** A fully-wired app with no logger, for `inject()`-based tests. */
export const createTestApp = (): Promise<FastifyInstance> => build();
