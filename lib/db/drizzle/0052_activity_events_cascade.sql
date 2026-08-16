-- Change the activity_events user FK from ON DELETE NO ACTION to
-- ON DELETE CASCADE so that deleting a user row (DELETE /account, and
-- test after() hooks) does not require pre-deleting activity rows.
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
