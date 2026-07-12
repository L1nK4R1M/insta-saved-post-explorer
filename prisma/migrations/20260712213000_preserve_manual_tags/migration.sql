ALTER TABLE "post_tags"
ADD COLUMN "is_manual" BOOLEAN NOT NULL DEFAULT false;

-- Existing rows predate provenance tracking. Preserve them on the first
-- re-import so no administrator-created tag can be lost.
UPDATE "post_tags"
SET "is_manual" = true;
