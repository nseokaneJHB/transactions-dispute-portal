import { z } from "zod";

import {
	globalResponseSchema,
	paginatedGlobalResponseSchema,
	paginationSortAndSearchQuerySchema,
} from "../schema/global.js";

export type GlobalResponse = z.infer<typeof globalResponseSchema>;

export type PaginatedGlobalResponse = z.infer<
	typeof paginatedGlobalResponseSchema
>;

export type PaginationSortAndSearchQuery = z.infer<
	typeof paginationSortAndSearchQuerySchema
>;
