CREATE INDEX "application_events_user_id_created_at_id_idx" ON "application_events" USING btree ("user_id","created_at","id");
