ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pause_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retention_offer_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_reminder_time" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_goal" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;