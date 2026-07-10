export type CaptionMetrics = {
  likes: number | null;
  comments: number | null;
  text: string;
};

const SOCIAL_PREFIX = /^\s*([\d.,]+\s*[kKmM]?)\s+(?:likes?|mentions?\s+j[’']aime)\s*,\s*([\d.,]+\s*[kKmM]?)\s+comment(?:s|aires?)?\s*-\s*/i;

export function parseCaptionMetrics(caption: string): CaptionMetrics {
  const normalized = caption.replace(/\r\n?/g, "\n").trim();
  const match = normalized.match(SOCIAL_PREFIX);
  if (!match) return { likes: null, comments: null, text: normalized };

  let text = normalized.slice(match[0].length);
  const quotedCaption = text.match(/^.*?:\s*[“"]([\s\S]*)[”"]\.?\s*$/);
  if (quotedCaption) text = quotedCaption[1];

  return {
    likes: parseSocialCount(match[1]),
    comments: parseSocialCount(match[2]),
    text: text.trim(),
  };
}

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
