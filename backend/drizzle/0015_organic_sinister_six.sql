CREATE TABLE "newsletter_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"iso_week" varchar(8) NOT NULL,
	"status" varchar(20) NOT NULL,
	"sent_job_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_sends_user_id_iso_week_unique" ON "newsletter_sends" USING btree ("user_id","iso_week");--> statement-breakpoint
CREATE INDEX "newsletter_sends_user_id_created_at_idx" ON "newsletter_sends" USING btree ("user_id","created_at");