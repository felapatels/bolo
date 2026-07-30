CREATE TABLE "phrase_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phrase_id" integer NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"language_code" text NOT NULL,
	"stage" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phrase_reports" ADD CONSTRAINT "phrase_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrase_reports" ADD CONSTRAINT "phrase_reports_phrase_id_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."phrases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrase_reports" ADD CONSTRAINT "phrase_reports_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "phrase_reports_user_created_idx" ON "phrase_reports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "phrase_reports_phrase_idx" ON "phrase_reports" USING btree ("phrase_id");