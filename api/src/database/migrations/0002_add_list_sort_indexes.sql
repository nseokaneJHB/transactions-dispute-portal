CREATE INDEX "dispute_user_status_idx" ON "dispute" USING btree ("user_id","status","id");--> statement-breakpoint
CREATE INDEX "dispute_status_id_idx" ON "dispute" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "user_name_idx" ON "user" USING btree ("name");--> statement-breakpoint
CREATE INDEX "transaction_amount_idx" ON "transaction" USING btree ("amount_cents");--> statement-breakpoint
CREATE INDEX "transaction_merchant_idx" ON "transaction" USING btree ("merchant_name");