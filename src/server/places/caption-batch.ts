import "server-only";

import {
  placeCandidateRecordSchema,
  type PlaceCandidateRecord,
} from "@/lib/places/candidates";
import { canonicalPlacesTheme, type PlacesEligibleTheme } from "@/lib/places/eligibility";
import { analyzeCandidateBatchRecord } from "@/server/places/analysis";
import { prisma } from "@/server/db";
import { computePlacesInputHash } from "@/server/places/hash";
import { PLACES_ANALYSIS_VERSION, PlacesJobError } from "@/server/places/jobs";
import { loadAnalysisPostInputs } from "@/server/places/repository";
import type { PlaceResolver } from "@/server/places/resolvers/types";

// Local caption-only workflow (design D3). The exporter emits a bounded,
// text-only JSONL batch of eligible posts for external Claude/Codex analysis;
// the importer validates the returned candidate JSONL and drives atomic
// resolution and persistence. No media URL, R2 credential, or collection is ever
// read or emitted. All access is owner-scoped.

const MAX_EXPORT_LIMIT = 1_000;
const MAX_HASHTAGS = 50;

// One exported line: only the minimal text fields the model needs.
export type CaptionBatchRecord = {
  post_id: string;
  main_theme: PlacesEligibleTheme;
  caption: string;
  hashtags: string[];
  internal_tags: string[];
  author_username: string;
  instagram_location: string | null;
};

export type ExportCaptionBatchInput = {
  ownerId: string;
  limit?: number;
  postId?: string;
  force?: boolean;
  analysisVersion?: string;
};

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value)));
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of matches) {
    const tag = raw.slice(1);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_HASHTAGS) break;
  }
  return tags;
}

export async function exportCaptionBatch(input: ExportCaptionBatchInput): Promise<CaptionBatchRecord[]> {
  const limit = clampLimit(input.limit, 100, MAX_EXPORT_LIMIT);
  const analysisVersion = input.analysisVersion?.trim() || PLACES_ANALYSIS_VERSION;

  const posts = await prisma.post.findMany({
    where: { ownerId: input.ownerId, mainTheme: { not: null }, ...(input.postId ? { id: input.postId } : {}) },
    orderBy: [{ savedAt: "desc" }, { id: "asc" }],
    take: 2_000,
    select: { id: true, mainTheme: true },
  });

  const records: CaptionBatchRecord[] = [];
  for (const post of posts) {
    if (records.length >= limit) break;

    const theme = canonicalPlacesTheme(post.mainTheme);
    if (!theme) continue; // eligibility comes only from mainTheme; collections are never read

    const inputs = await loadAnalysisPostInputs(input.ownerId, post.id);
    if (!inputs) continue;

    if (!input.force) {
      const inputHash = computePlacesInputHash({
        analysisVersion,
        postId: inputs.id,
        sourceTheme: theme,
        caption: inputs.caption,
        authorUsername: inputs.authorUsername,
        internalTags: inputs.internalTags,
        structuredLocation: inputs.structuredLocation,
        verifiedMedia: inputs.verifiedMedia,
      });
      const done = await prisma.placeAnalysisJob.findFirst({
        where: { ownerId: input.ownerId, postId: inputs.id, inputHash, analysisVersion, status: "SUCCEEDED" },
        select: { id: true },
      });
      if (done) continue; // already analyzed for this exact input; use --force to re-export
    }

    records.push({
      post_id: inputs.id,
      main_theme: theme,
      caption: inputs.caption,
      hashtags: extractHashtags(inputs.caption),
      internal_tags: inputs.internalTags,
      author_username: inputs.authorUsername,
      instagram_location: inputs.structuredLocation,
    });
  }

  return records;
}

export function serializeCaptionBatch(records: CaptionBatchRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

export type ImportCandidateBatchInput = {
  ownerId: string;
  jsonl: string;
  resolver: PlaceResolver;
  commit?: boolean;
  limit?: number;
  postId?: string;
  continueOnError?: boolean;
  analysisVersion?: string;
};

export type ImportReport = {
  committed: boolean;
  totalLines: number;
  validRecords: number;
  invalidRecords: number;
  postsProcessed: number;
  postsSucceeded: number;
  postsNeedingReview: number;
  postsFailed: number;
  placesPersisted: number;
  linksPersisted: number;
  evidencePersisted: number;
  unknownCandidates: number;
  errors: Array<{ line: number; code: string }>;
};

class ImportLineError extends Error {
  constructor(readonly line: number, readonly code: string) {
    super(code);
    this.name = "ImportLineError";
  }
}

// Never surface a raw message (it could echo a caption); keep a bounded code.
function safeErrorCode(error: unknown): string {
  if (error instanceof PlacesJobError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code.slice(0, 64);
  }
  return "ANALYSIS_ERROR";
}

function parseRecord(line: string): PlaceCandidateRecord {
  return placeCandidateRecordSchema.parse(JSON.parse(line));
}

export async function importCandidateBatch(input: ImportCandidateBatchInput): Promise<ImportReport> {
  const commit = input.commit ?? false;
  const continueOnError = input.continueOnError ?? false;
  const limit = clampLimit(input.limit, MAX_EXPORT_LIMIT, MAX_EXPORT_LIMIT);

  const lines = input.jsonl.split(/\r?\n/).map((line) => line.trim());
  const report: ImportReport = {
    committed: commit,
    totalLines: lines.filter(Boolean).length,
    validRecords: 0,
    invalidRecords: 0,
    postsProcessed: 0,
    postsSucceeded: 0,
    postsNeedingReview: 0,
    postsFailed: 0,
    placesPersisted: 0,
    linksPersisted: 0,
    evidencePersisted: 0,
    unknownCandidates: 0,
    errors: [],
  };

  let processed = 0;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    if (processed >= limit) break;
    const lineNumber = index + 1;

    let record: PlaceCandidateRecord;
    try {
      record = parseRecord(line);
    } catch {
      report.invalidRecords += 1;
      report.errors.push({ line: lineNumber, code: "INVALID_RECORD" });
      if (!continueOnError) throw new ImportLineError(lineNumber, "INVALID_RECORD");
      continue;
    }

    if (input.postId && record.post_id !== input.postId) continue;
    report.validRecords += 1;
    processed += 1;

    try {
      const result = await analyzeCandidateBatchRecord({
        ownerId: input.ownerId,
        record,
        resolver: input.resolver,
        analysisVersion: input.analysisVersion,
        commit,
      });
      report.postsProcessed += 1;
      report.placesPersisted += result.placesPersisted;
      report.linksPersisted += result.linksPersisted;
      report.evidencePersisted += result.evidencePersisted;
      report.unknownCandidates += result.unknownCandidates;
      if (result.status === "SUCCEEDED" || result.status === "SKIPPED_DRY_RUN") report.postsSucceeded += 1;
      if (result.status === "NEEDS_REVIEW") report.postsNeedingReview += 1;
    } catch (error) {
      report.postsFailed += 1;
      report.errors.push({ line: lineNumber, code: safeErrorCode(error) });
      if (!continueOnError) throw error;
    }
  }

  return report;
}
