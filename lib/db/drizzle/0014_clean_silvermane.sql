CREATE TABLE "script_trace_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chapter" text NOT NULL,
	"character_id" text NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"best_score" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_trace_progress_unique" UNIQUE("user_id","chapter","character_id")
);
--> statement-breakpoint
ALTER TABLE "script_trace_progress" ADD CONSTRAINT "script_trace_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;