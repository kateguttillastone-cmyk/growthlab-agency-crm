CREATE TYPE "public"."audit_ack_status" AS ENUM('pending', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."audit_request_status" AS ENUM('Nouvelle', 'Contactée', 'Audit livré', 'Convertie', 'Rejetée');--> statement-breakpoint
CREATE TABLE "audit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_name" text NOT NULL,
	"website" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text,
	"message" text,
	"consent_text" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "audit_request_status" DEFAULT 'Nouvelle' NOT NULL,
	"note" text,
	"owner_id" uuid,
	"lead_id" uuid,
	"ack_status" "audit_ack_status" DEFAULT 'pending' NOT NULL,
	"ack_sent_at" timestamp with time zone,
	"ack_message_id" text,
	"ack_error" text,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_requests_created_idx" ON "audit_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_requests_status_idx" ON "audit_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_requests_email_idx" ON "audit_requests" USING btree ("email");