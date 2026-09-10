import { z } from "zod";

import {
	adminInviteStatusSchema,
	emailSchema,
	stringSchema,
	uuidSchema,
} from "./field.js";
import {
	globalResponseSchema,
	isOrderedDateRange,
	ORDERED_DATE_RANGE_ISSUE,
	paginatedGlobalResponseSchema,
	paginationQuerySchema,
} from "./global.js";
import { ADMIN_INVITE_SORT } from "../constant.js";

/**
 * Body for `POST /v1/admin/invites` — an existing admin invites a new admin by
 * email. No self-service admin signup (`docs/decisions.md` #16); accepting the
 * emailed link is the only way an admin account is created.
 */
export const adminInviteCreateBodySchema = z.object({
	email: emailSchema,
});

/**
 * Body for `POST /v1/admin/invites/:token/accept` — the invitee's display name.
 * The email is taken from the invite, not the request, so a link can't be
 * redirected to a different address.
 */
export const adminInviteAcceptBodySchema = z.object({
	name: stringSchema
		.min(1, "A name is required.")
		.max(255, "Keep the name under 255 characters.")
		.describe("The new admin's display name"),
});

/** Path param for the accept route — an opaque invite token, not a UUID. */
export const adminInviteTokenParamsSchema = z.object({
	token: stringSchema.min(1, "An invite token is required."),
});

/**
 * Query for `GET /v1/admin/invites` — a page of the calling admin's own
 * invites, optionally narrowed to one derived `status`. `status` is not a
 * column, so the server translates it to a predicate over `accepted_at` /
 * `expires_at`. `search` matches the invitee email; `from` / `to` bound
 * `created_at`; `sort` picks the column. Everything but `sort` is inherited
 * from `paginationQuerySchema`.
 */
export const adminInvitesQuerySchema = paginationQuerySchema
	.extend({
		status: adminInviteStatusSchema
			.optional()
			.describe("Only invites currently in this state"),
		sort: z
			.enum(ADMIN_INVITE_SORT)
			.optional()
			.describe("Column to sort the page by — defaults to `created_at`"),
	})
	.refine(isOrderedDateRange, ORDERED_DATE_RANGE_ISSUE);

/**
 * One invite on the wire. The `token` is never returned — it only ever travels
 * in the emailed link. `status` is derived server-side from `accepted_at` /
 * `expires_at` (`ADMIN_INVITE_STATUS`), not a column. Timestamps are ISO 8601
 * strings.
 */
export const adminInviteSchema = z.object({
	id: uuidSchema,
	email: stringSchema.describe("Who the invite was sent to"),
	status: adminInviteStatusSchema,
	accepted_at: stringSchema
		.nullable()
		.describe("When the invite was accepted (ISO 8601), or null"),
	expires_at: stringSchema.describe("When the invite expires (ISO 8601)"),
	created_at: stringSchema.describe("When the invite was sent (ISO 8601)"),
});

/** Response for `POST /v1/admin/invites`. */
export const adminInviteResponseSchema = globalResponseSchema.extend({
	data: adminInviteSchema,
});

/** Response for `GET /v1/admin/invites` — one page of the calling admin's invites. */
export const adminInviteListResponseSchema = paginatedGlobalResponseSchema.extend(
	{
		data: z.array(adminInviteSchema),
	},
);
