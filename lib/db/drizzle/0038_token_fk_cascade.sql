-- Chunk 5A fix: change token_ledger and user_token_state user FK from
-- ON DELETE NO ACTION to ON DELETE CASCADE so that deleting a user row
-- (e.g. in test after() hooks) does not require pre-deleting token rows.
ALTER TABLE "token_ledger" DROP CONSTRAINT "token_ledger_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "token_ledger" ADD CONSTRAINT "token_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_token_state" DROP CONSTRAINT "user_token_state_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "user_token_state" ADD CONSTRAINT "user_token_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
