CREATE TABLE IF NOT EXISTS "collections" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL DEFAULT 'local',
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "collections_owner_id_slug_key" ON "collections"("owner_id", "slug");
CREATE INDEX IF NOT EXISTS "collections_owner_public_name_idx" ON "collections"("owner_id", "is_public", "name");

CREATE TABLE IF NOT EXISTS "collection_posts" (
  "collection_id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_posts_pkey" PRIMARY KEY ("collection_id", "post_id")
);
CREATE INDEX IF NOT EXISTS "collection_posts_post_id_collection_id_idx" ON "collection_posts"("post_id", "collection_id");

DO $$ BEGIN
  ALTER TABLE "collection_posts" ADD CONSTRAINT "collection_posts_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "collection_posts" ADD CONSTRAINT "collection_posts_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "collections" ("id", "owner_id", "name", "slug", "is_system", "is_public", "updated_at")
SELECT 'favorites_' || md5(owners."owner_id"), owners."owner_id", 'Favoris', 'favoris', true, true, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "owner_id" FROM "posts" UNION SELECT DISTINCT "owner_id" FROM "tags") owners
ON CONFLICT ("owner_id", "slug") DO UPDATE SET "name" = 'Favoris', "is_system" = true, "is_public" = true;

INSERT INTO "collection_posts" ("collection_id", "post_id")
SELECT c."id", pt."post_id"
FROM "post_tags" pt
JOIN "tags" t ON t."id" = pt."tag_id" AND t."slug" = 'favoris'
JOIN "collections" c ON c."owner_id" = t."owner_id" AND c."slug" = 'favoris'
ON CONFLICT DO NOTHING;
