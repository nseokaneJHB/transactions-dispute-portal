ALTER TABLE "admin_invite" DROP CONSTRAINT "admin_invite_token_unique";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_token_unique";--> statement-breakpoint
DROP INDEX "account_updated_idx";--> statement-breakpoint
DROP INDEX "admin_invite_email_idx";--> statement-breakpoint
DROP INDEX "admin_invite_updated_idx";--> statement-breakpoint
DROP INDEX "auth_audit_log_email_idx";--> statement-breakpoint
DROP INDEX "auth_audit_log_event_idx";--> statement-breakpoint
DROP INDEX "auth_audit_log_created_at_idx";--> statement-breakpoint
DROP INDEX "dispute_audit_log_created_at_idx";--> statement-breakpoint
DROP INDEX "dispute_user_id_idx";--> statement-breakpoint
DROP INDEX "dispute_status_idx";--> statement-breakpoint
DROP INDEX "dispute_reason_idx";--> statement-breakpoint
DROP INDEX "dispute_updated_idx";--> statement-breakpoint
DROP INDEX "user_role_idx";--> statement-breakpoint
DROP INDEX "user_updated_idx";--> statement-breakpoint
DROP INDEX "session_updated_idx";--> statement-breakpoint
DROP INDEX "verification_updated_idx";--> statement-breakpoint
DROP INDEX "transaction_user_id_idx";--> statement-breakpoint
DROP INDEX "transaction_updated_idx";--> statement-breakpoint
DROP INDEX "transaction_transacted_at_idx";--> statement-breakpoint
CREATE INDEX "dispute_user_created_idx" ON "dispute" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "dispute_status_created_idx" ON "dispute" USING btree ("status","created_at","id" DESC NULLS FIRST);