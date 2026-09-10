import { z } from "zod";

import {
	adminInviteSchema,
	adminInviteCreateBodySchema,
	adminInviteAcceptBodySchema,
	adminInviteTokenParamsSchema,
	adminInvitesQuerySchema,
	adminInviteResponseSchema,
	adminInviteListResponseSchema,
} from "../schema/admin-invite.js";

export type AdminInviteCreateBody = z.infer<typeof adminInviteCreateBodySchema>;

export type AdminInviteAcceptBody = z.infer<typeof adminInviteAcceptBodySchema>;

export type AdminInviteTokenParams = z.infer<
	typeof adminInviteTokenParamsSchema
>;

export type AdminInvitesQuery = z.infer<typeof adminInvitesQuerySchema>;

export type AdminInvite = z.infer<typeof adminInviteSchema>;

export type AdminInviteResponse = z.infer<typeof adminInviteResponseSchema>;

export type AdminInviteListResponse = z.infer<
	typeof adminInviteListResponseSchema
>;
