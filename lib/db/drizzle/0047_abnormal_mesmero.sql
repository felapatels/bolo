CREATE TABLE "chacha_encounters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_code" text NOT NULL,
	"station" integer NOT NULL,
	"kind" text NOT NULL,
	"phrase_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chacha_encounters_user_language_station_unique" UNIQUE("user_id","language_code","station")
);
--> statement-breakpoint
ALTER TABLE "chacha_encounters" ADD CONSTRAINT "chacha_encounters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chacha_encounters" ADD CONSTRAINT "chacha_encounters_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chacha_encounters" ADD CONSTRAINT "chacha_encounters_phrase_id_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."phrases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chacha_encounters_user_language_idx" ON "chacha_encounters" USING btree ("user_id","language_code");