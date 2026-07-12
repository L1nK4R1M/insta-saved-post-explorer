export type CaptionMetrics = {
  likes: number | null;
  comments: number | null;
  publishedAt: Date | null;
  text: string;
};

const SOCIAL_PREFIX = /^\s*([\d.,]+\s*[kKmM]?)\s+(?:likes?|mentions?\s+j[’']aime)\s*,\s*([\d.,]+\s*[kKmM]?)\s+comment(?:s|aires?)?\s*-\s*/i;

export function parseCaptionMetrics(caption: string): CaptionMetrics {
  const normalized = caption.replace(/\r\n?/g, "\n").trim();
  const match = normalized.match(SOCIAL_PREFIX);
  if (!match) return { likes: null, comments: null, publishedAt: null, text: normalized };

  let text = normalized.slice(match[0].length);
  const publishedAt = parseInstagramCaptionDate(text);
  const quotedCaption = text.match(/^.*?:\s*[“"]([\s\S]*)[”"]\.?\s*$/);
  if (quotedCaption) text = quotedCaption[1];

  return {
    likes: parseSocialCount(match[1]),
    comments: parseSocialCount(match[2]),
    publishedAt,
    text: text.trim(),
  };
}

function parseInstagramCaptionDate(value: string): Date | null {
  const match = value.match(/\b(?:le|on)\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*:/i);
  if (!match) return null;
  const month = ENGLISH_MONTHS.get(match[1].toLowerCase());
  if (month === undefined) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date
    : null;
}

const ENGLISH_MONTHS = new Map([
  ["january", 0], ["february", 1], ["march", 2], ["april", 3],
  ["may", 4], ["june", 5], ["july", 6], ["august", 7],
  ["september", 8], ["october", 9], ["november", 10], ["december", 11],
]);

function parseSocialCount(value: string): number | null {
  const compact = value.trim().toLowerCase().replace(/\s/g, "");
  const suffix = compact.endsWith("k") || compact.endsWith("m") ? compact.slice(-1) : "";
  const rawNumber = suffix ? compact.slice(0, -1) : compact;
  const decimal = suffix
    ? rawNumber.replace(",", ".")
    : rawNumber.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(decimal);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * (suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1));
}
