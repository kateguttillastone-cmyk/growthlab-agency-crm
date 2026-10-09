CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "sending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "send_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "send_error" text;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_messages_provider_id_idx" ON "email_messages" USING btree ("provider_message_id");