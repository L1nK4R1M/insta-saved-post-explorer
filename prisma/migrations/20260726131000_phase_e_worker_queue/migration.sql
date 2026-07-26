-- Phase E expands the existing Places queue with claim and retry timestamps.
ALTER TABLE "place_analysis_jobs"
  ADD COLUMN "claimed_at" TIMESTAMPTZ(3),
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);

CREATE INDEX "place_jobs_worker_available_idx"
  ON "place_analysis_jobs" ("owner_id", "status", "next_attempt_at", "lease_expires_at", "priority" DESC, "created_at", "id")
  WHERE "status" IN ('PENDING', 'PROCESSING');

-- The worker role remains NOLOGIN. Operators provision a separate login role
-- and grant membership outside migrations.
REVOKE ALL ON "place_analysis_jobs" FROM "ipe_worker_reader";
GRANT SELECT (
  "id", "owner_id", "post_id", "source_theme", "depth", "status", "stage",
  "priority", "analysis_version", "input_hash", "attempt_count", "max_attempts",
  "lease_owner", "lease_expires_at", "claimed_at", "next_attempt_at",
  "heartbeat_at", "created_at", "updated_at"
) ON "place_analysis_jobs" TO "ipe_worker_reader";
GRANT UPDATE (
  "status", "stage", "attempt_count", "lease_owner", "lease_expires_at",
  "claimed_at", "next_attempt_at", "heartbeat_at", "result", "error_code",
  "error_message", "started_at", "completed_at", "updated_at"
) ON "place_analysis_jobs" TO "ipe_worker_reader";

REVOKE ALL ON "posts" FROM "ipe_worker_reader";
GRANT SELECT (
  "id", "owner_id", "post_url", "author_username", "caption", "main_theme"
) ON "posts" TO "ipe_worker_reader";
