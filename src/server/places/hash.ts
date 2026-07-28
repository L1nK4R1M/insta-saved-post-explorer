import "server-only";

import { createHash } from "node:crypto";

// Stable input hash used for job idempotency. It hashes only the bounded,
// meaningful analysis inputs, never a volatile timestamp, so the same post
// content always maps to the same job. Object keys are serialized in a stable
// order and arrays are sorted deterministically.

export type PlacesHashInput = {
  analysisVersion: string;
  postId: string;
  sourceTheme: string;
  caption: string;
  authorUsername: string;
  internalTags: string[];
  structuredLocation: string | null;
  verifiedMedia: Array<{ objectKey: string; versionTag: string | null }>;
};

export function computePlacesInputHash(input: PlacesHashInput): string {
  const canonical = {
    analysisVersion: input.analysisVersion,
    postId: input.postId,
    sourceTheme: input.sourceTheme,
    caption: input.caption,
    authorUsername: input.authorUsername,
    internalTags: [...input.internalTags].sort(),
    structuredLocation: input.structuredLocation,
    verifiedMedia: [...input.verifiedMedia]
      .map((media) => ({ objectKey: media.objectKey, versionTag: media.versionTag }))
      .sort((left, right) => left.objectKey.localeCompare(right.objectKey)),
  };
  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

// Deterministic JSON with object keys sorted at every depth.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}
