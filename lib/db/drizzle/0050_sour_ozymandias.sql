CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"ref_id" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_created_idx" ON "activity_events" USING btree ("user_id","created_at" DESC NULLS LAST);