# CODEX_R2_WORKER_ISOLATION_DESIGN.md

> Phase C design — R2 media identity and worker isolation.
> Reviewed design artifact. This document satisfies the "separate reviewed
> design" entry gate for Phase C. It does not authorize a migration or worker
> code: the Phase C implementation is a separate pull request that stops for
> review at its exit gate. Decisions D1–D4 in section 8 are signed off by the
> owner (23 July 2026).

## 1. Scope and authority

Authority order: `AGENTS.md` → `CODEX_IMPLEMENTATION_ORDER.md` (Phase C) → this design → repository code.

Phase C goal (from `CODEX_IMPLEMENTATION_ORDER.md`, Phase C): allow a restricted worker to read only an authorized media object, by giving each media an authoritative, durable R2 identity and by guaranteeing owner isolation on the rows and objects the worker will touch.

In scope for the Phase C implementation this design leads to:

- persist an authoritative R2 identity for media (canonical key, MIME, size, version token, check timestamp);
- distinguish repairable media from analyzable media;
- denormalize `ownerId` onto the media table so worker queries are owner-scoped without a join;
- create a restricted, read-only PostgreSQL role for the worker;
- document the R2 bucket/worker credentials;
- a forward-recovery procedure for the migration.

Explicitly **out of scope** here (later phases — do not build in Phase C):

- the `place_analysis_jobs` queue, claim/lease/heartbeat (Phase E);
- the Places domain models and jobs (Phase F);
- FFmpeg / OCR / transcription / any deep analysis (Phase H);
- the worker process itself as a deployed service (Phase E). Phase C only prepares the data and access model it will later depend on.

## 2. Current state (grounded in code)

### 2.1 Media schema

`prisma/schema.prisma` — `PostMedia` has `id`, `postId`, `type` (`IMAGE|VIDEO`), `url`, `sourcePath`, `thumbnailUrl`, `position`. There is **no** `ownerId`, `objectKey`, MIME, byte size, ETag/version, or check timestamp. Ownership is reachable only through `PostMedia → Post.ownerId`.

### 2.2 Write path (extension sync)

`src/app/api/sync/posts/route.ts` already does the right validation but discards the evidence:

- `validateR2ObjectReference()` enforces the object key matches the strict pattern `${prefix}/${author}/${code}{suffix}.{ext}` and equals `${prefix}/${sourcePath}`;
- `verifyR2Object(objectKey, byteSize)` sends `HeadObjectCommand`, checks `ContentLength === byteSize`, and **returns `{ etag, contentType }`** — but the caller ignores both;
- the row is written with only `url = publicMediaUrl(objectKey)`, `source_path`, `thumbnail_url`, `type`.

So the canonical key is *reconstructable* (`objectKey = ${MEDIA_PATH_PREFIX}/${sourcePath}`, or via `objectKeyFromPublicMediaUrl(url)`), but it is **not stored authoritatively**, and the verified MIME/size/ETag are lost. Phase C mostly *persists evidence the sync path already gathers*.

Note on the ETag: both upload paths (`uploadR2Object` with a full `Body`, and the presigned-URL PUT from `prepareR2Upload`) are **single-part** puts, so R2 returns a content-MD5 ETag. Phase C treats the ETag as an opaque version token regardless (see D1), so it does not depend on that property.

### 2.3 Import path (JSON)

The legacy JSON import path accepts arbitrary `url`/`source_path` with **no R2 verification**. Media imported this way may have no R2 identity — the "historical / incomplete media" case that must be *flagged, not guessed*.

### 2.4 R2 helpers and env

`src/server/r2.ts` uses `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MEDIA_PATH_PREFIX`, `MEDIA_PUBLIC_BASE_URL`. `scripts/vercel-preflight.mjs` validates the R2 four as a complete-or-absent group. There is a single web-side credential set and no worker-specific R2 credential yet.

### 2.5 Owner isolation today

`Post`, `Collection`, `Tag`, `ImportJob`, `SyncJob` carry `ownerId`. Second-level rows (`PostMedia`, `PostTag`, `CollectionPost`) inherit owner only by relation. Safe for the current application-mediated access; risky once a VPS worker issues its own SQL.

## 3. Gap analysis → Phase C exit gate

| Exit-gate item (Phase C) | Current state | Phase C work |
| --- | --- | --- |
| No arbitrary URL accepted | Sync validates keys; import does not | Persist a verified canonical key; mark unverifiable media non-analyzable |
| Worker reads only a known, authorized object | No stored authoritative key; no worker role | Store canonical key + version token; restricted read-only role |
| Incomplete historical media flagged, not guessed | Silent (url/sourcePath only) | Add an explicit media-identity status; backfill flags, never fabricates identity |
| Owner isolation tested | ownerId via join only | Denormalize `ownerId` on media; owner-scoped tests |

## 4. Proposed R2 media identity model

Add authoritative identity columns to `PostMedia` (names illustrative; finalized at implementation):

```prisma
model PostMedia {
  // ... existing fields ...
  ownerId       String        @map("owner_id")        // denormalized from Post
  objectKey     String?       @map("object_key")      // authoritative R2 key, canonical
  mimeType      String?       @map("mime_type")       // verified via HeadObject
  byteSize      Int?          @map("byte_size")       // verified via HeadObject
  versionTag    String?       @map("version_tag")     // R2 ETag, opaque (D1)
  identityState MediaIdentity @default(UNVERIFIED) @map("identity_state")
  checkedAt     DateTime?     @map("checked_at") @db.Timestamptz(3)

  @@index([ownerId, identityState], map: "post_media_owner_identity_idx")
}

enum MediaIdentity {
  UNVERIFIED   // legacy/import media, no derivable R2 identity — NOT analyzable
  REPAIRABLE   // key derivable but presence not yet confirmed in R2
  VERIFIED     // key + mime + size confirmed present in R2 — analyzable by the worker
}
```

Rationale:

- `objectKey` is the single authoritative reference. The worker never accepts a URL; it reads `objectKey` under the permitted prefix only.
- `identityState` makes the repairable-vs-analyzable distinction explicit and queryable (exit gate: "flagged, not guessed").
- The sync path already computes everything needed to write `VERIFIED` — this persists evidence it already gathers.
- Legacy/import media default to `UNVERIFIED` and are never promoted without a real HeadObject check.

## 5. Proposed worker isolation model

- **Denormalize `ownerId` onto `PostMedia`** so every worker query filters by owner without a join, and a restricted role can be reasoned about by owner.
- **Restricted PostgreSQL role** (`worker_reader` or similar): `SELECT` only, only on the media identity columns Phase C introduces (Phase E later extends grants to the jobs table). No access to `tags`, `collections`, auth, or any write privilege. Provisioned by SQL in the migration; credentials supplied out-of-band, never committed.
- **Owner isolation** is enforced by the restricted grant plus application query discipline (`WHERE owner_id = …`) and proven by an owner-scoped test. Row-Level Security is intentionally deferred (see D2) — the deployment is single-owner (`APP_OWNER_ID`) today.
- **Read-only R2 credential** scoped to the media prefix, distinct from the web upload credential, on the **same bucket** (`R2_BUCKET_NAME`). The worker resolves an object only as `objectKey` on a `VERIFIED` row it may read; it never dereferences `url`.

## 6. R2 environment variables

Keep `R2_BUCKET_NAME` as the single bucket name for both web and worker. Add worker-only read credentials as separate variables (e.g. `R2_WORKER_ACCESS_KEY_ID` / `R2_WORKER_SECRET_ACCESS_KEY`) documented in `.env.example` and `docs/deployment.md`. These are worker-side (GitHub Environments / VPS), so `scripts/vercel-preflight.mjs` is extended only if they ever become required on Vercel — to confirm at implementation.

## 7. Migration and recovery

- **Forward, additive only:** new nullable columns + new enum + new index + role creation. No column drops, no type changes on existing data.
- **`ownerId` on `PostMedia`:** two-step to avoid long locks / partial failure — add nullable + backfill from `Post` (`UPDATE ... FROM`) in the migration, then `SET NOT NULL` in a follow-up migration once confirmed.
- **Identity backfill** (promote to `VERIFIED` via HeadObject) is a **separate, idempotent, re-runnable** maintenance step, never part of the schema migration and never blocking it. Failures leave the row `UNVERIFIED`/`REPAIRABLE`.
- **Recovery = fix-forward** (D4): `prisma migrate deploy` is forward-only in production; the migration is additive so there is nothing destructive to undo; Neon branch / point-in-time restore is the safety net if the schema migration itself fails.

## 8. Decisions (signed off — owner, 23 July 2026)

- **D1 — Fingerprint = R2 ETag, stored as an opaque version token.** Zero added cost (already returned by `verifyR2Object`), sufficient for change-detection and recording which version was analyzed. A content-addressing SHA-256 at upload time is recorded as a **future hardening** option, not a Phase C gate.
- **D2 — Worker uses a restricted read-only PostgreSQL role.** This matches the transactional claim the Phase E worker requires; the `/api/v1` path is for MCP/Hermes, not the worker. Owner isolation is enforced by **restricted grant + query discipline + an owner-scoped test**; Row-Level Security is a **future hardening** if multi-owner ever arrives.
- **D3 — Historical media stays `UNVERIFIED`/`REPAIRABLE` with lazy backfill.** Nothing is promoted to `VERIFIED` without a real HeadObject success. A full backfill sweep is a **deferred, idempotent maintenance task** (likely alongside Phase F/H), not a Phase C gate.
- **D4 — Fix-forward additive migration** with the recovery procedure in section 7. No scripted down-migration is required; a down-migration would only drop the new columns and is not the desired production behavior.

## 9. Test plan (for the implementation PR, not now)

- owner isolation: media rows are owner-scoped; a query as owner B never returns owner A's media;
- `identityState` reaches `VERIFIED` only after a real size/MIME match; a failed/absent object never becomes `VERIFIED`;
- legacy/import media stays `UNVERIFIED` and is excluded from the analyzable set;
- the sync path persists the ETag/MIME/size it already verifies;
- the restricted role can `SELECT` the media identity columns and nothing else (role-permission test against PostgreSQL);
- existing `/api/posts`, media URL resolution, and repair flows are unchanged.

## 10. Next step

The Phase C entry gate (a reviewed design) is satisfied by this document with D1–D4 signed off. A dedicated Phase C implementation branch then adds, in one coherent pull request that stops for review at the exit gate:

1. the additive migration (identity columns, `MediaIdentity` enum, index, restricted role);
2. persistence of the verified R2 identity in the sync path;
3. the `ownerId` denormalization and its two-step NOT NULL;
4. the idempotent identity-backfill maintenance step;
5. the env/docs updates for the worker R2 credentials;
6. the tests in section 9.

No later phase (E, F, H, …) is started in the same pull request.
