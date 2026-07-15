CREATE TABLE IF NOT EXISTS "friend_invites" (
"id" serial PRIMARY KEY NOT NULL,
"inviter_id" text NOT NULL,
"invitee_email" text NOT NULL,
"send_count" integer DEFAULT 1 NOT NULL,
"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "friend_invites_pair_unique" UNIQUE("inviter_id","invitee_email")
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friend_invites_inviter_id_users_id_fk') THEN
  ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
