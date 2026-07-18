CREATE TABLE "daily_quiz_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_code" text NOT NULL,
	"quiz_date" date NOT NULL,
	"score" integer NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_quiz_completions_user_language_date_unique" UNIQUE("user_id","language_code","quiz_date")
);
--> statement-breakpoint
CREATE TABLE "daily_quizzes" (
	"id" serial PRIMARY KEY NOT NULL,
	"language_code" text NOT NULL,
	"quiz_date" date NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_quizzes_language_date_unique" UNIQUE("language_code","quiz_date")
);
--> statement-breakpoint
ALTER TABLE "daily_quiz_completions" ADD CONSTRAINT "daily_quiz_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quiz_completions" ADD CONSTRAINT "daily_quiz_completions_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_quizzes" ADD CONSTRAINT "daily_quizzes_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;