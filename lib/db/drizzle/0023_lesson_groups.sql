CREATE TABLE "lesson_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"language_code" text NOT NULL,
	"category_id" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_groups_language_category_position_unique" UNIQUE("language_code","category_id","position")
);
--> statement-breakpoint
ALTER TABLE "phrases" ADD COLUMN "lesson_group_id" integer;--> statement-breakpoint
ALTER TABLE "phrases" ADD COLUMN "lesson_group_position" integer;--> statement-breakpoint
ALTER TABLE "lesson_groups" ADD CONSTRAINT "lesson_groups_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_groups" ADD CONSTRAINT "lesson_groups_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_groups_language_category_position_idx" ON "lesson_groups" USING btree ("language_code","category_id","position");--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_lesson_group_id_lesson_groups_id_fk" FOREIGN KEY ("lesson_group_id") REFERENCES "public"."lesson_groups"("id") ON DELETE no action ON UPDATE no action;