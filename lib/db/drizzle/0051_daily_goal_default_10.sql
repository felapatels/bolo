ALTER TABLE "users" ALTER COLUMN "daily_goal" SET DEFAULT 10;--> statement-breakpoint
UPDATE "users" SET "daily_goal" = 10 WHERE "daily_goal" = 50;