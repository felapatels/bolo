CREATE TABLE "family_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_plans_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "family_plans_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "family_seats" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text NOT NULL,
	"invited_email" text,
	"invite_token" text,
	"member_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	CONSTRAINT "family_seats_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "family_seats_member_user_id_unique" UNIQUE("member_user_id"),
	CONSTRAINT "family_seats_plan_email_unique" UNIQUE("plan_id","invited_email")
);
--> statement-breakpoint
ALTER TABLE "family_plans" ADD CONSTRAINT "family_plans_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_seats" ADD CONSTRAINT "family_seats_plan_id_family_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."family_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_seats" ADD CONSTRAINT "family_seats_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;