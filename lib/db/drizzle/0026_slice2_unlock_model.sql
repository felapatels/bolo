CREATE TABLE "lesson_group_progress" (
	"user_id" text NOT NULL,
	"lesson_group_id" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_group_progress_user_id_lesson_group_id_pk" PRIMARY KEY("user_id","lesson_group_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_group_testouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_group_id" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_group_progress" ADD CONSTRAINT "lesson_group_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_group_progress" ADD CONSTRAINT "lesson_group_progress_lesson_group_id_lesson_groups_id_fk" FOREIGN KEY ("lesson_group_id") REFERENCES "public"."lesson_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_group_testouts" ADD CONSTRAINT "lesson_group_testouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_group_testouts" ADD CONSTRAINT "lesson_group_testouts_lesson_group_id_lesson_groups_id_fk" FOREIGN KEY ("lesson_group_id") REFERENCES "public"."lesson_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_group_testouts_user_group_idx" ON "lesson_group_testouts" USING btree ("user_id","lesson_group_id");--> statement-breakpoint
ALTER TABLE "lesson_groups" ADD CONSTRAINT "lesson_groups_id_language_category_unique" UNIQUE("id","language_code","category_id");--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_lesson_group_scope_fk" FOREIGN KEY ("lesson_group_id","language_code","category_id") REFERENCES "public"."lesson_groups"("id","language_code","category_id") ON DELETE no action ON UPDATE no action