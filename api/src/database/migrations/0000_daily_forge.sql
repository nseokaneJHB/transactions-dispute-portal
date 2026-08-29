CREATE TYPE "public"."authEvent" AS ENUM('OTP_REQUESTED', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'OTP_LOCKED');--> statement-breakpoint
CREATE TYPE "public"."disputeReason" AS ENUM('FRAUDULENT_CHARGE', 'DUPLICATE_CHARGE', 'INCORRECT_AMOUNT', 'GOODS_NOT_RECEIVED', 'SUBSCRIPTION_NOT_CANCELLED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."disputeStatus" AS ENUM('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."userRole" AS ENUM('ADMIN', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope" varchar(255),
	"password" varchar(255),
	"id_token" varchar(255),
	"issuer" varchar(255) NOT NULL,
	"access_token" varchar(255),
	"refresh_token" varchar(255),
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_invite" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "admin_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" varchar(255) NOT NULL,
	"ip_address" varchar(255),
	"user_agent" varchar(255),
	"event" "authEvent" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "dispute_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note" text,
	"from_status" "disputeStatus",
	"to_status" "disputeStatus" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"dispute_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"description" text NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"status" "disputeStatus" DEFAULT 'SUBMITTED' NOT NULL,
	"reason" "disputeReason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"resolved_by" uuid,
	"transaction_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"image" text,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"role" "userRole" DEFAULT 'CUSTOMER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_agent" varchar(255),
	"ip_address" varchar(255),
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"value" text NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"amount_cents" bigint NOT NULL,
	"merchant_name" varchar(255) NOT NULL,
	"transacted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invite" ADD CONSTRAINT "admin_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_audit_log" ADD CONSTRAINT "dispute_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_audit_log" ADD CONSTRAINT "dispute_audit_log_dispute_id_dispute_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."dispute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_updated_idx" ON "account" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uq_idx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "admin_invite_email_idx" ON "admin_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_invite_invited_by_idx" ON "admin_invite" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "admin_invite_updated_idx" ON "admin_invite" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invite_token_uq_idx" ON "admin_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_audit_log_email_idx" ON "auth_audit_log" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_audit_log_event_idx" ON "auth_audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "auth_audit_log_user_id_idx" ON "auth_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_audit_log_created_at_idx" ON "auth_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispute_audit_log_actor_id_idx" ON "dispute_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "dispute_audit_log_dispute_id_idx" ON "dispute_audit_log" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "dispute_audit_log_created_at_idx" ON "dispute_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispute_user_id_idx" ON "dispute" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dispute_status_idx" ON "dispute" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dispute_reason_idx" ON "dispute" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "dispute_resolved_by_idx" ON "dispute" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "dispute_transaction_id_idx" ON "dispute" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "dispute_created_at_idx" ON "dispute" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dispute_updated_idx" ON "dispute" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_open_per_transaction_uq_idx" ON "dispute" USING btree ("transaction_id") WHERE "dispute"."status" in ('SUBMITTED', 'UNDER_REVIEW');--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "user_updated_idx" ON "user" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_updated_idx" ON "session" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "verification_updated_idx" ON "verification" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "transaction_user_id_idx" ON "transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_updated_idx" ON "transaction" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "transaction_transacted_at_idx" ON "transaction" USING btree ("transacted_at");--> statement-breakpoint
CREATE INDEX "transaction_user_transacted_idx" ON "transaction" USING btree ("user_id","transacted_at");