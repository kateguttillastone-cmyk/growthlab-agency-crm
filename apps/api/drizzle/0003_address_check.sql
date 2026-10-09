CREATE TYPE "public"."address_check" AS ENUM('valid', 'invalid_syntax', 'no_mail_server', 'disposable');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_check" "address_check";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_checked_at" timestamp with time zone;