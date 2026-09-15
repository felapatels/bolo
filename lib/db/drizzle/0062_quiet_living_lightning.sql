CREATE TABLE "voice_contribution_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribution_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"reviewer" text NOT NULL,
	"verdict" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_practice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_contributions" ADD COLUMN "language_code" text;--> statement-breakpoint
ALTER TABLE "voice_contributions" ADD COLUMN "phrase_id" integer;--> statement-breakpoint
ALTER TABLE "voice_contribution_reviews" ADD CONSTRAINT "voice_contribution_reviews_contribution_id_voice_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."voice_contributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vcr_clip_session_unq" ON "voice_contribution_reviews" USING btree ("contribution_id","session_id");--> statement-breakpoint
CREATE INDEX "vc_phrase_idx" ON "voice_contributions" USING btree ("phrase_id");