-- Phase C: authoritative R2 media identity + restricted worker role.
-- Additive migration only. No column drops, no type changes on existing data.

-- 1. Media identity state enum (idempotent).
DO $$ BEGIN
  CREATE TYPE "MediaIdentity" AS ENUM ('UNVERIFIED', 'REPAIRABLE', 'VERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Additive identity columns on post_media.
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "owner_id" TEXT;
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "object_key" TEXT;
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "byte_size" INTEGER;
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "version_tag" TEXT;
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "identity_state" "MediaIdentity" NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "post_media" ADD COLUMN IF NOT EXISTS "checked_at" TIMESTAMPTZ(3);

-- 3. Backfill owner_id from the parent post, then enforce NOT NULL.
--    Backfill runs before the constraint so a NOT NULL is never applied to
--    unpopulated rows (the two-step made atomic; the table is small).
UPDATE "post_media" m
SET "owner_id" = p."owner_id"
FROM "posts" p
WHERE p."id" = m."post_id" AND m."owner_id" IS NULL;
ALTER TABLE "post_media" ALTER COLUMN "owner_id" SET NOT NULL;

-- 4. Owner-scoped identity index for worker queries.
CREATE INDEX IF NOT EXISTS "post_media_owner_identity_idx" ON "post_media"("owner_id", "identity_state");

-- 5. Restricted, read-only worker role, scoped to the media identity columns.
--    Created NOLOGIN: an operator grants it to a login role and sets credentials
--    out-of-band (see docs/deployment.md). Never store a password in a migration.
--    Roles are cluster-global, so creation is idempotent.
DO $$ BEGIN
  CREATE ROLE "ipe_worker_reader" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA "public" TO "ipe_worker_reader";
REVOKE ALL ON "post_media" FROM "ipe_worker_reader";
-- Read-only, and only the identity/locator columns — never url/source_path/thumbnail_url.
GRANT SELECT (
  "id", "post_id", "owner_id", "type", "position",
  "object_key", "mime_type", "byte_size", "version_tag", "identity_state", "checked_at"
) ON "post_media" TO "ipe_worker_reader";
