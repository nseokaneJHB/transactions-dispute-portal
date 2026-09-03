import type { RouteGenericInterface } from "fastify";

import type {
	GlobalResponse,
	HealthzResponse,
	ReadyzResponse,
} from "@transaction-dispute-portal/shared";

export interface HealthzRequest extends RouteGenericInterface {
	Reply: HealthzResponse | GlobalResponse;
}

export interface ReadyzRequest extends RouteGenericInterface {
	Reply: ReadyzResponse | GlobalResponse;
}
