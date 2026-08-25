CREATE TABLE "username_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_user_id" text NOT NULL,
	"reported_username" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_stats" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "username_reports" ADD CONSTRAINT "username_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "username_reports" ADD CONSTRAINT "username_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_reports_reporter_created_idx" ON "username_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "username_reports_reported_idx" ON "username_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "username_reports_status_idx" ON "username_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));