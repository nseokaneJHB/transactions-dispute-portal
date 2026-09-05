import { z } from "zod";

import { emailSchema, stringSchema, uuidSchema } from "./field.js";
import { globalResponseSchema } from "./global.js";

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
 * One invite on the wire. The `token` is never returned — it only ever travels
 * in the emailed link. Timestamps are ISO 8601 strings.
 */
export const adminInviteSchema = z.object({
	id: uuidSchema,
	email: stringSchema.describe("Who the invite was sent to"),
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
