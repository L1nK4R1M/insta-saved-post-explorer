import { z } from "zod";

// Textual place candidates produced by Claude Code or the Codex CLI. The
// contract is deliberately text-only: models never provide coordinates, a
// provider, a provider identifier, or a precision. Only PlaceResolver may
// return coordinates. `.strict()` rejects any such forbidden extra field.

export const PLACE_CANDIDATE_CATEGORIES = [
  "restaurant",
  "lodging",
  "landmark",
  "city",
  "region",
  "other",
] as const;

export const PLACE_CANDIDATE_EVIDENCE_TYPES = [
  "CAPTION",
  "HASHTAG",
  "AUTHOR_TEXT",
  "INSTAGRAM_LOCATION",
] as const;

const MAX_EXCERPT_LENGTH = 500;
const MAX_EVIDENCE_PER_CANDIDATE = 8;
const MAX_CANDIDATES_PER_POST = 5;

const boundedNullableName = z.string().trim().min(1).max(200).nullable();

const candidateEvidenceSchema = z
  .object({
    type: z.enum(PLACE_CANDIDATE_EVIDENCE_TYPES),
    excerpt: z.string().trim().min(1).max(MAX_EXCERPT_LENGTH),
  })
  .strict();

export const placeCandidateSchema = z
  .object({
    name: boundedNullableName,
    city: boundedNullableName,
    region: boundedNullableName,
    country: boundedNullableName,
    category: z.enum(PLACE_CANDIDATE_CATEGORIES),
    confidence: z.number().min(0).max(1),
    evidence: z.array(candidateEvidenceSchema).max(MAX_EVIDENCE_PER_CANDIDATE),
  })
  .strict();

export const placeCandidateBatchSchema = z.array(placeCandidateSchema).max(MAX_CANDIDATES_PER_POST);

// One JSONL line of the caption-analysis result: the post it belongs to and its
// bounded, text-only candidates. `.strict()` rejects any coordinate, provider,
// providerPlaceId, precision, or other unknown field at the record level too.
export const placeCandidateRecordSchema = z
  .object({
    post_id: z.string().trim().min(1).max(200),
    candidates: placeCandidateBatchSchema,
  })
  .strict();

export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;
export type PlaceCandidateEvidence = z.infer<typeof candidateEvidenceSchema>;
export type PlaceCandidateCategory = (typeof PLACE_CANDIDATE_CATEGORIES)[number];
export type PlaceCandidateRecord = z.infer<typeof placeCandidateRecordSchema>;
