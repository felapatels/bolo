CREATE TABLE "signal_waves" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_waves_user_ref_unique" UNIQUE("user_id","ref")
);
--> statement-breakpoint
ALTER TABLE "signal_waves" ADD CONSTRAINT "signal_waves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;