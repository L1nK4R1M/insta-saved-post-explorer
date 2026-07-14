export type MediaRepairCandidate = {
  postUrl: string;
  position: number;
  sourceUrl: string;
};

export function extractMediaRepairCandidates(entries: unknown[]): MediaRepairCandidate[] {
  const repairs = new Map<string, MediaRepairCandidate>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const contentType = stringValue(entry.content_type, entry.contentType)?.toLocaleLowerCase("fr");
    if (contentType !== "carousel") continue;
    const postUrl = stringValue(entry.post_url, entry.postUrl);
    if (!postUrl || !Array.isArray(entry.media)) continue;
    for (const [index, rawMedia] of entry.media.entries()) {
      if (!isRecord(rawMedia)) continue;
      const mediaType = stringValue(rawMedia.type, rawMedia.media_type)?.toLocaleLowerCase("fr");
      if (mediaType !== "video") continue;
      const sourceUrl = stringValue(rawMedia.original_thumbnail_url, rawMedia.originalThumbnailUrl);
      const position = integerValue(rawMedia.position) ?? index;
      if (!sourceUrl || position < 0 || position > 19) continue;
      const candidate = { postUrl, position, sourceUrl };
      repairs.set(`${postUrl}:${position}`, candidate);
    }
  }
  return [...repairs.values()];
}

export function createMediaRepairBatches(
  repairs: MediaRepairCandidate[],
  batchSize = 5,
): MediaRepairCandidate[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) {
    throw new Error("Taille de lot invalide.");
  }
  const batches: MediaRepairCandidate[][] = [];
  for (let index = 0; index < repairs.length; index += batchSize) {
    batches.push(repairs.slice(index, index + batchSize));
  }
  return batches;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | null {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}
