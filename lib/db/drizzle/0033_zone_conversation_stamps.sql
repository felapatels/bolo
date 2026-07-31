CREATE TABLE "zone_conversation_stamps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_code" text NOT NULL,
	"zone_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_conversation_stamps_user_language_zone_unique" UNIQUE("user_id","language_code","zone_index")
);
--> statement-breakpoint
ALTER TABLE "zone_conversation_stamps" ADD CONSTRAINT "zone_conversation_stamps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
