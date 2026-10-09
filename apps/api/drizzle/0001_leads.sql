CREATE TYPE "public"."call_state" AS ENUM('À appeler', 'Injoignable', 'RDV fixé', 'Répondu', 'Pas intéressé');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('NRP', 'PI', 'PB NUMERO', 'REPONDEUR', 'A RAP', 'BARRAGE SECRETAIRE', 'RDV fixé');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('Envoyé', 'Délivré', 'Ouvert', 'Bounce', 'Désinscrit');--> statement-breakpoint
CREATE TYPE "public"."lead_service" AS ENUM('Google Ads', 'Création de site', 'Refonte de site');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('Nouveau', 'Contacté', 'Répondu', 'RDV programmé', 'RDV effectué', 'Proposition envoyée', 'Négociation', 'Gagné', 'Perdu');--> statement-breakpoint
CREATE TYPE "public"."qualification" AS ENUM('Chaud', 'Tiède', 'Froid');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribe', 'bounce', 'complaint', 'manual');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('Pas Validé', 'Validé', 'Rejeté');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"domain" text,
	"website" text,
	"sector" text,
	"employees" integer,
	"founded_year" integer,
	"address" text,
	"city" text,
	"postal_code" text,
	"region" text,
	"country" text DEFAULT 'FR' NOT NULL,
	"phone" text,
	"linkedin_url" text,
	"description" text,
	"google_category" text,
	"google_rating" numeric(2, 1),
	"google_reviews" integer,
	"google_maps_url" text,
	"gps" text,
	"organic_traffic" integer,
	"domain_authority" integer,
	"backlinks" integer,
	"cms" text,
	"is_ecommerce" boolean,
	"has_gtm" boolean,
	"has_ga4" boolean,
	"has_meta_pixel" boolean,
	"has_google_ads" boolean,
	"has_ssl" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"first_name" text,
	"last_name" text,
	"name_key" text DEFAULT '' NOT NULL,
	"job_title" text,
	"email" text,
	"linkedin_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"sequence_no" integer DEFAULT 1 NOT NULL,
	"subject" text,
	"body" text,
	"validation" "validation_status" DEFAULT 'Pas Validé' NOT NULL,
	"validated_at" timestamp with time zone,
	"status" "email_status",
	"sent_on" date,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"owner_id" uuid,
	"source" text DEFAULT 'Inconnue' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualification" "qualification",
	"qualification_reason" text,
	"service" "lead_service",
	"service_detail" text,
	"stage" "pipeline_stage",
	"deal_value" numeric(12, 2),
	"pack" text,
	"call_status" "call_status",
	"followup_1" "call_status",
	"followup_2" "call_status",
	"call_state" "call_state",
	"comment" text,
	"next_action" text,
	"import_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_deal_value_check" CHECK ("leads"."deal_value" is null or "leads"."deal_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_domain_uq" ON "companies" USING btree ("domain") WHERE "companies"."domain" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_name_phone_uq" ON "companies" USING btree ("name_key",coalesce("phone", '')) WHERE "companies"."domain" is null;--> statement-breakpoint
CREATE INDEX "companies_sector_idx" ON "companies" USING btree ("sector");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_uq" ON "contacts" USING btree ("email") WHERE "contacts"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_name_uq" ON "contacts" USING btree ("company_id","name_key") WHERE "contacts"."email" is null;--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_lead_seq_uq" ON "email_messages" USING btree ("lead_id","sequence_no");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_messages_validation_idx" ON "email_messages" USING btree ("validation");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead_events" USING btree ("lead_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "leads_contact_uq" ON "leads" USING btree ("contact_id") WHERE "leads"."contact_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_company_only_uq" ON "leads" USING btree ("company_id") WHERE "leads"."contact_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_import_key_uq" ON "leads" USING btree ("import_key") WHERE "leads"."import_key" is not null;--> statement-breakpoint
CREATE INDEX "leads_detected_idx" ON "leads" USING btree ("detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "leads_qualification_idx" ON "leads" USING btree ("qualification");--> statement-breakpoint
CREATE INDEX "leads_service_idx" ON "leads" USING btree ("service");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");