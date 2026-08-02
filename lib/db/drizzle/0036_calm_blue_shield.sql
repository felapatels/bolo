CREATE TABLE "zone_testouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"language_code" text NOT NULL,
	"category_id" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zone_testouts" ADD CONSTRAINT "zone_testouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_testouts" ADD CONSTRAINT "zone_testouts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zone_testouts_user_lang_cat_idx" ON "zone_testouts" USING btree ("user_id","language_code","category_id");