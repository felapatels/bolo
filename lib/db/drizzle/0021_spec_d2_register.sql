ALTER TABLE "phrases" ADD COLUMN "register" text;--> statement-breakpoint
CREATE INDEX "phrases_language_register_idx" ON "phrases" USING btree ("language_code","register");
