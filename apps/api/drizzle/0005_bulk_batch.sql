ALTER TABLE "email_messages" ADD COLUMN "bulk_batch" uuid;--> statement-breakpoint
CREATE INDEX "email_messages_bulk_batch_idx" ON "email_messages" USING btree ("bulk_batch");