CREATE TABLE "subscription_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"environment" text,
	"store" text,
	"product_id" text,
	"period_type" text,
	"price_cents" integer,
	"currency" text,
	"price_usd_cents" integer,
	"is_revenue" boolean DEFAULT false NOT NULL,
	"purchased_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_events_event_id_unique" ON "subscription_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "subscription_events_user_idx" ON "subscription_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "subscription_events_occurred_idx" ON "subscription_events" USING btree ("occurred_at");