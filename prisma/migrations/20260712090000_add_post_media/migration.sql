CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "post_media" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT,
    "source_path" TEXT,
    "thumbnail_url" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "post_media_position_check" CHECK ("position" >= 0),
    CONSTRAINT "post_media_source_check" CHECK ("url" IS NOT NULL OR "source_path" IS NOT NULL OR "thumbnail_url" IS NOT NULL),
    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_media_post_id_position_key" ON "post_media"("post_id", "position");
CREATE INDEX "post_media_post_id_position_idx" ON "post_media"("post_id", "position");

ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "post_media" ("id", "post_id", "type", "url", "source_path", "thumbnail_url", "position")
SELECT
  'legacy_' || md5("id"),
  "id",
  CASE WHEN "content_type" = 'REEL' THEN 'VIDEO'::"MediaType" ELSE 'IMAGE'::"MediaType" END,
  "media_url",
  NULL,
  "thumbnail_url",
  0
FROM "posts";
