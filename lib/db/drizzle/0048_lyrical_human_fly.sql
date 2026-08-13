CREATE TABLE "friend_code_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_code_attempts" ADD CONSTRAINT "friend_code_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_code_attempts_user_idx" ON "friend_code_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_code_attempts_ip_idx" ON "friend_code_attempts" USING btree ("ip_hash","created_at");