-- Phase F1: Places metadata-first domain. Additive migration only.
-- No existing column drop or type change. The two spurious diffs Prisma emits
-- for pre-existing raw-SQL drift (the posts trigram index and the collections
-- updated_at default) are intentionally excluded to keep this migration additive.

-- CreateEnum
CREATE TYPE "PlacePrecision" AS ENUM ('EXACT', 'PROBABLE', 'APPROXIMATE');

-- CreateEnum
CREATE TYPE "PlaceReviewStatus" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "PlaceEvidenceType" AS ENUM ('INSTAGRAM_LOCATION', 'CAPTION', 'HASHTAG', 'AUTHOR_TEXT', 'PROVIDER_MATCH', 'USER_CORRECTION');

-- CreateEnum
CREATE TYPE "PlaceAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlaceAnalysisStage" AS ENUM ('QUEUED', 'EXTRACTING', 'RESOLVING', 'PERSISTING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "PlaceAnalysisDepth" AS ENUM ('METADATA_ONLY', 'AUTO', 'DEEP');

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT,
    "provider" TEXT NOT NULL,
    "provider_place_id" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "country_code" TEXT,
    "continent_code" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "precision" "PlacePrecision" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "approximation_radius_meters" INTEGER,
    "review_status" "PlaceReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "is_user_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_places" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "place_id" TEXT NOT NULL,
    "analysis_job_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "precision" "PlacePrecision" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "is_user_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "post_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_evidence" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "place_id" TEXT,
    "analysis_job_id" TEXT NOT NULL,
    "evidence_type" "PlaceEvidenceType" NOT NULL,
    "normalized_value" TEXT,
    "excerpt" TEXT,
    "video_timestamp_ms" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_analysis_jobs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "source_theme" TEXT NOT NULL,
    "depth" "PlaceAnalysisDepth" NOT NULL DEFAULT 'METADATA_ONLY',
    "status" "PlaceAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "PlaceAnalysisStage" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "analysis_version" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "place_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "places_owner_updated_id_idx" ON "places"("owner_id", "updated_at", "id");
CREATE INDEX "places_owner_country_idx" ON "places"("owner_id", "country_code");
CREATE INDEX "places_owner_continent_idx" ON "places"("owner_id", "continent_code");
CREATE INDEX "places_owner_review_idx" ON "places"("owner_id", "review_status");
CREATE UNIQUE INDEX "places_owner_provider_id_key" ON "places"("owner_id", "provider", "provider_place_id");

CREATE INDEX "post_places_owner_post_idx" ON "post_places"("owner_id", "post_id");
CREATE INDEX "post_places_owner_place_idx" ON "post_places"("owner_id", "place_id");
CREATE UNIQUE INDEX "post_places_owner_post_place_key" ON "post_places"("owner_id", "post_id", "place_id");

CREATE INDEX "place_evidence_owner_post_idx" ON "place_evidence"("owner_id", "post_id");
CREATE INDEX "place_evidence_owner_job_idx" ON "place_evidence"("owner_id", "analysis_job_id");

CREATE INDEX "place_jobs_owner_status_priority_idx" ON "place_analysis_jobs"("owner_id", "status", "priority", "created_at");
CREATE INDEX "place_jobs_owner_post_created_idx" ON "place_analysis_jobs"("owner_id", "post_id", "created_at");
CREATE UNIQUE INDEX "place_jobs_idempotency_key" ON "place_analysis_jobs"("owner_id", "post_id", "input_hash", "analysis_version");

-- AddForeignKey
ALTER TABLE "post_places" ADD CONSTRAINT "post_places_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_places" ADD CONSTRAINT "post_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_places" ADD CONSTRAINT "post_places_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "place_analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "place_evidence" ADD CONSTRAINT "place_evidence_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "place_evidence" ADD CONSTRAINT "place_evidence_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "place_evidence" ADD CONSTRAINT "place_evidence_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "place_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "place_analysis_jobs" ADD CONSTRAINT "place_analysis_jobs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants enforced in SQL (design section 4, plan Task 1 step 5).
ALTER TABLE "places"
  ADD CONSTRAINT "places_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "places_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "places_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
  ADD CONSTRAINT "places_approximation_radius_check" CHECK (
    -- APPROXIMATE requires a positive radius; NULL is rejected explicitly so
    -- SQL three-valued logic (NULL > 0 = NULL) cannot pass the check.
    ("precision" = 'APPROXIMATE' AND "approximation_radius_meters" IS NOT NULL AND "approximation_radius_meters" > 0)
    OR
    ("precision" <> 'APPROXIMATE' AND "approximation_radius_meters" IS NULL)
  );

ALTER TABLE "post_places"
  ADD CONSTRAINT "post_places_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "place_evidence"
  ADD CONSTRAINT "place_evidence_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

-- At most one primary link per owner and post.
CREATE UNIQUE INDEX "post_places_one_primary_per_post"
  ON "post_places" ("owner_id", "post_id")
  WHERE "is_primary" = TRUE;
