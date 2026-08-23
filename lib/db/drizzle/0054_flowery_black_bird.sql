CREATE TABLE "script_trace_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"script" text NOT NULL,
	"contributor" text NOT NULL,
	"is_practice" boolean DEFAULT false NOT NULL,
	"glyph_count" integer NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_trace_contributions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "voice_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"script" text NOT NULL,
	"contributor" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_label" text NOT NULL,
	"audio_base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"duration_ms" integer,
	"is_practice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"script" text NOT NULL,
	"contributor" text NOT NULL,
	"passage_id" text NOT NULL,
	"passage_text" text NOT NULL,
	"reads_well" boolean NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"is_practice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "stc_script_idx" ON "script_trace_contributions" USING btree ("script");--> statement-breakpoint
CREATE INDEX "stc_created_at_idx" ON "script_trace_contributions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vc_session_prompt_unq" ON "voice_contributions" USING btree ("session_id","prompt_id");--> statement-breakpoint
CREATE INDEX "vc_script_idx" ON "voice_contributions" USING btree ("script");--> statement-breakpoint
CREATE INDEX "vc_prompt_idx" ON "voice_contributions" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "vc_contributor_idx" ON "voice_contributions" USING btree ("contributor");--> statement-breakpoint
CREATE UNIQUE INDEX "pf_session_passage_unq" ON "passage_feedback" USING btree ("session_id","passage_id");--> statement-breakpoint
CREATE INDEX "pf_passage_idx" ON "passage_feedback" USING btree ("passage_id");