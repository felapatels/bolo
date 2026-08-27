CREATE TABLE "chat_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"memory" text NOT NULL,
	"source_language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_memories_user_memory_unique" UNIQUE("user_id","memory")
);
--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_memories_user_idx" ON "chat_memories" USING btree ("user_id");