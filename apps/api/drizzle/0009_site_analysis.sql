ALTER TABLE "companies" ADD COLUMN "has_viewport" boolean;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "site_status" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "site_checked_at" timestamp with time zone;