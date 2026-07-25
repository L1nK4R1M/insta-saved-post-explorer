// Friendly place-type groups derived from the provider category stored on a
// Place. Geoapify returns hierarchical dotted categories ("catering.restaurant",
// "catering.cafe", "tourism.sights.monument"); the UI needs a small, stable set of
// human labels to filter on. Grouping happens here so both the filter UI and the
// query layer share one definition — the raw provider strings never leak into the
// UI, and no group is invented that the data cannot fill.
//
// Note: Geoapify has no "brunch" category. The owner decided to fold brunch into
// the café group until a dedicated source (internal tags) exists; that decision is
// recorded on the group itself so the UI can label it honestly.

export type PlaceCategoryGroupKey =
  | "restaurant"
  | "cafe"
  | "patisserie"
  | "bar"
  | "hotel"
  | "plage"
  | "monument";

export type PlaceCategoryGroup = {
  key: PlaceCategoryGroupKey;
  label: string;
  icon: string;
  /** Raw provider category prefixes that belong to this group. */
  prefixes: readonly string[];
  /** True when the group also covers a concept the provider does not model. */
  includesBrunch?: boolean;
};

export const PLACE_CATEGORY_GROUPS: readonly PlaceCategoryGroup[] = [
  { key: "restaurant", label: "Restaurant", icon: "🍽️", prefixes: ["catering.restaurant", "catering.fast_food"] },
  { key: "cafe", label: "Café et brunch", icon: "☕", prefixes: ["catering.cafe", "catering.coffee"], includesBrunch: true },
  { key: "patisserie", label: "Pâtisserie", icon: "🍰", prefixes: ["catering.bakery", "catering.pastry"] },
  { key: "bar", label: "Bar", icon: "🍸", prefixes: ["catering.bar", "catering.pub", "catering.biergarten"] },
  { key: "hotel", label: "Hôtel", icon: "🏨", prefixes: ["accommodation.hotel", "accommodation"] },
  { key: "plage", label: "Plage", icon: "🏖️", prefixes: ["beach"] },
  { key: "monument", label: "Monument", icon: "🏛️", prefixes: ["tourism.attraction", "tourism.sights"] },
] as const;

const GROUP_KEYS = new Set<string>(PLACE_CATEGORY_GROUPS.map((group) => group.key));

export function isPlaceCategoryGroup(value: unknown): value is PlaceCategoryGroupKey {
  return typeof value === "string" && GROUP_KEYS.has(value);
}

function normalizeRawCategory(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

// Resolve the group a raw provider category belongs to. The longest matching
// prefix wins so a more specific mapping is never shadowed by a broader one.
export function groupForRawCategory(raw: string | null | undefined): PlaceCategoryGroupKey | null {
  const value = normalizeRawCategory(raw);
  if (!value) return null;

  let best: { key: PlaceCategoryGroupKey; length: number } | null = null;
  for (const group of PLACE_CATEGORY_GROUPS) {
    for (const prefix of group.prefixes) {
      const matches = value === prefix || value.startsWith(`${prefix}.`);
      if (matches && (!best || prefix.length > best.length)) {
        best = { key: group.key, length: prefix.length };
      }
    }
  }
  return best?.key ?? null;
}

// Raw provider prefixes to match when filtering on a set of groups. Used by the
// query layer to build a bounded OR of case-insensitive prefix matches.
export function rawCategoryPrefixesForGroups(groups: readonly PlaceCategoryGroupKey[]): string[] {
  const prefixes: string[] = [];
  const seen = new Set<string>();
  for (const key of groups) {
    const group = PLACE_CATEGORY_GROUPS.find((candidate) => candidate.key === key);
    if (!group) continue;
    for (const prefix of group.prefixes) {
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      prefixes.push(prefix);
    }
  }
  return prefixes;
}

// Parse a comma-separated list of group keys, dropping unknown values so a
// hand-edited URL can never widen the filter beyond the known groups.
export function parseCategoryGroups(value: string | null | undefined): PlaceCategoryGroupKey[] {
  if (!value) return [];
  const groups: PlaceCategoryGroupKey[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const key = part.trim().toLowerCase();
    if (!isPlaceCategoryGroup(key) || seen.has(key)) continue;
    seen.add(key);
    groups.push(key);
  }
  return groups;
}
