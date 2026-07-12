CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL DEFAULT 'local',
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "collected" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "media_uploaded" INTEGER NOT NULL DEFAULT 0,
    "media_failed" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_jobs_owner_started_idx" ON "sync_jobs"("owner_id", "started_at");
