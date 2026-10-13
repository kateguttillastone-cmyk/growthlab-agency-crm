CREATE TABLE "sourcing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"criteria" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"estimated_cost" numeric(10, 2) NOT NULL,
	"cost" numeric(10, 2),
	"progress" integer,
	"found" integer,
	"created" integer,
	"duplicates" integer,
	"rejected" integer,
	"error" text,
	"provider_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sourcing_runs" ADD CONSTRAINT "sourcing_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sourcing_runs_state_idx" ON "sourcing_runs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "sourcing_runs_created_idx" ON "sourcing_runs" USING btree ("created_at" DESC NULLS LAST);