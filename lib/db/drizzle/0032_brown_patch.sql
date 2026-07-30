ALTER TABLE "users" ADD COLUMN "has_chosen_language" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Grandfather every existing account: any non-null active_language predates the
-- language-selection onboarding step (values were client-seeded or explicitly
-- picked), so those accounts must never see the step.
UPDATE "users" SET "has_chosen_language" = true WHERE "active_language" IS NOT NULL;
