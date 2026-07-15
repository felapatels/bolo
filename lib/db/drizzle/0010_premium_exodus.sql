CREATE TABLE "tts_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"audio_base64" text NOT NULL,
	"format" text DEFAULT 'mp3' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
