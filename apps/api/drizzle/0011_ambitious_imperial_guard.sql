CREATE TYPE "public"."registry_status" AS ENUM('active', 'closed', 'to_confirm');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registry_status" "registry_status";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registry_siren" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registry_closed_on" date;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registry_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registry_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "companies_registry_idx" ON "companies" USING btree ("registry_status") WHERE "companies"."registry_status" is not null;