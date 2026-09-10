import { z } from "zod";

import {
	disputeSchema,
	disputesQuerySchema,
	adminDisputesQuerySchema,
	disputeCreateBodySchema,
	disputeResponseSchema,
	disputeListResponseSchema,
	adminDisputeSchema,
	disputeResolveBodySchema,
	adminDisputeResponseSchema,
	adminDisputeListResponseSchema,
	disputeStatusCountsSchema,
	adminDisputeSummaryResponseSchema,
} from "../schema/dispute.js";

export type DisputeCreateBody = z.infer<typeof disputeCreateBodySchema>;

export type DisputesQuery = z.infer<typeof disputesQuerySchema>;

export type AdminDisputesQuery = z.infer<typeof adminDisputesQuerySchema>;

export type Dispute = z.infer<typeof disputeSchema>;

export type DisputeResponse = z.infer<typeof disputeResponseSchema>;

export type DisputeListResponse = z.infer<typeof disputeListResponseSchema>;

export type AdminDispute = z.infer<typeof adminDisputeSchema>;

export type DisputeResolveBody = z.infer<typeof disputeResolveBodySchema>;

export type AdminDisputeResponse = z.infer<typeof adminDisputeResponseSchema>;

export type AdminDisputeListResponse = z.infer<
	typeof adminDisputeListResponseSchema
>;

export type DisputeStatusCounts = z.infer<typeof disputeStatusCountsSchema>;

export type AdminDisputeSummaryResponse = z.infer<
	typeof adminDisputeSummaryResponseSchema
>;
