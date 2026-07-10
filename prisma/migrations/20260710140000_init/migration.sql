-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('IMAGE', 'CAROUSEL', 'REEL', 'OTHER');

-- Enable indexed accent-folded substring search on the normalized search column.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL DEFAULT 'local',
    "external_id" TEXT,
    "post_url" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "media_url" TEXT,
    "author_username" TEXT NOT NULL,
    "author_sort_key" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "saved_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "content_type" "ContentType" NOT NULL DEFAULT 'OTHER',
    "main_theme" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "search_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL DEFAULT 'local',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "post_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id", "tag_id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL DEFAULT 'local',
    "idempotency_key" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "source_name" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "invalid" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posts_owner_id_post_url_key" ON "posts"("owner_id", "post_url");
CREATE INDEX "posts_owner_saved_at_id_idx" ON "posts"("owner_id", "saved_at", "id");
CREATE INDEX "posts_owner_published_at_id_idx" ON "posts"("owner_id", "published_at", "id");
CREATE INDEX "posts_owner_author_id_idx" ON "posts"("owner_id", "author_sort_key", "id");
CREATE INDEX "posts_owner_main_theme_idx" ON "posts"("owner_id", "main_theme");
CREATE INDEX "posts_search_text_fts_idx" ON "posts" USING GIN (to_tsvector('simple', "search_text"));
CREATE INDEX "posts_search_text_trgm_idx" ON "posts" USING GIN ("search_text" gin_trgm_ops);
CREATE UNIQUE INDEX "tags_owner_id_slug_key" ON "tags"("owner_id", "slug");
CREATE INDEX "tags_owner_name_idx" ON "tags"("owner_id", "name");
CREATE INDEX "post_tags_tag_id_post_id_idx" ON "post_tags"("tag_id", "post_id");
CREATE UNIQUE INDEX "import_jobs_owner_idempotency_key" ON "import_jobs"("owner_id", "idempotency_key");
CREATE INDEX "import_jobs_owner_status_started_idx" ON "import_jobs"("owner_id", "status", "started_at");

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
