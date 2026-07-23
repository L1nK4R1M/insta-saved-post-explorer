import "server-only";

import { Prisma } from "@prisma/client";

import { canonicalPlacesTheme, PLACES_ELIGIBLE_THEMES } from "@/lib/places/eligibility";
import type { PlacesStatsDto, PlacesStatsInput } from "@/contracts/api/places";
import { prisma } from "@/server/db";
import { eligibleThemeVariants } from "@/server/places/queries";

// Owner-scoped Places statistics. Counts use distinct aggregations so a place
// linked to many posts counts once, and a post linked to many places counts
// once. REJECTED places are excluded from identified totals. UNKNOWN outcomes
// (which create no Place) are surfaced only through the NEEDS_REVIEW job count.
// No CollectionPost join is ever used.

type CountRow = { n: number };
type CountryRow = { country_code: string; country: string | null; place_count: number; post_count: number };
type ContinentRow = { continent_code: string; place_count: number; country_count: number; post_count: number };
type ThemeCountRow = { place_count: number; post_count: number };

// Compose the owner + optional geo/precision filter shared by the place-scoped
// aggregations. `alias` is the SQL table alias for the places table.
function placeFilterSql(alias: string, ownerId: string, input: PlacesStatsInput, excludeRejected: boolean): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`${Prisma.raw(alias)}.owner_id = ${ownerId}`];
  if (excludeRejected) parts.push(Prisma.sql`${Prisma.raw(alias)}.review_status <> 'REJECTED'`);
  if (input.countryCode) parts.push(Prisma.sql`${Prisma.raw(alias)}.country_code = ${input.countryCode}`);
  if (input.continentCode) parts.push(Prisma.sql`${Prisma.raw(alias)}.continent_code = ${input.continentCode}`);
  if (input.precision) parts.push(Prisma.sql`${Prisma.raw(alias)}.precision = ${input.precision}::"PlacePrecision"`);
  return Prisma.join(parts, " AND ");
}

export async function getPlacesStats(input: PlacesStatsInput, ownerId: string): Promise<PlacesStatsDto> {
  const variants = await eligibleThemeVariants(ownerId);
  const placeWhere = {
    ownerId,
    ...(input.countryCode ? { countryCode: input.countryCode } : {}),
    ...(input.continentCode ? { continentCode: input.continentCode } : {}),
    ...(input.precision ? { precision: input.precision } : {}),
  } as const;
  const identifiedWhere = { ...placeWhere, reviewStatus: { not: "REJECTED" as const } };

  const identifiedFilter = placeFilterSql("p", ownerId, input, true);

  const [
    eligiblePosts,
    identifiedPlaces,
    conflictPlaces,
    needsReviewJobs,
    byPrecisionGroups,
    byReviewStatusGroups,
    postsWithPlacesRows,
    byCountry,
    byContinent,
  ] = await Promise.all([
    variants.length > 0
      ? prisma.post.count({ where: { ownerId, mainTheme: { in: variants } } })
      : Promise.resolve(0),
    prisma.place.count({ where: identifiedWhere }),
    prisma.place.count({ where: { ...placeWhere, reviewStatus: "CONFLICT" } }),
    prisma.placeAnalysisJob.count({ where: { ownerId, status: "NEEDS_REVIEW" } }),
    prisma.place.groupBy({ by: ["precision"], where: identifiedWhere, _count: { _all: true } }),
    prisma.place.groupBy({ by: ["reviewStatus"], where: placeWhere, _count: { _all: true } }),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT pp.post_id)::int AS n
      FROM post_places pp
      JOIN places p ON p.id = pp.place_id AND p.owner_id = pp.owner_id
      WHERE ${identifiedFilter}
    `),
    prisma.$queryRaw<CountryRow[]>(Prisma.sql`
      SELECT p.country_code, MAX(p.country) AS country,
             COUNT(DISTINCT p.id)::int AS place_count,
             COUNT(DISTINCT pp.post_id)::int AS post_count
      FROM places p
      LEFT JOIN post_places pp ON pp.place_id = p.id AND pp.owner_id = p.owner_id
      WHERE ${identifiedFilter} AND p.country_code IS NOT NULL
      GROUP BY p.country_code
      ORDER BY place_count DESC, p.country_code ASC
    `),
    prisma.$queryRaw<ContinentRow[]>(Prisma.sql`
      SELECT p.continent_code,
             COUNT(DISTINCT p.id)::int AS place_count,
             COUNT(DISTINCT p.country_code)::int AS country_count,
             COUNT(DISTINCT pp.post_id)::int AS post_count
      FROM places p
      LEFT JOIN post_places pp ON pp.place_id = p.id AND pp.owner_id = p.owner_id
      WHERE ${identifiedFilter} AND p.continent_code IS NOT NULL
      GROUP BY p.continent_code
      ORDER BY place_count DESC, p.continent_code ASC
    `),
  ]);

  const byTheme = await computeByTheme(ownerId, input, variants);

  return {
    totals: {
      eligiblePosts,
      identifiedPlaces,
      countries: byCountry.length,
      continents: byContinent.length,
      postsWithPlaces: postsWithPlacesRows[0]?.n ?? 0,
      needsReview: conflictPlaces + needsReviewJobs,
    },
    byTheme,
    byCountry: byCountry.map((row) => ({
      countryCode: row.country_code,
      country: row.country,
      placeCount: row.place_count,
      postCount: row.post_count,
    })),
    byContinent: byContinent.map((row) => ({
      continentCode: row.continent_code,
      placeCount: row.place_count,
      countryCount: row.country_count,
      postCount: row.post_count,
    })),
    byPrecision: byPrecisionGroups.map((group) => ({ precision: group.precision, placeCount: group._count._all })),
    byReviewStatus: byReviewStatusGroups.map((group) => ({
      reviewStatus: group.reviewStatus,
      placeCount: group._count._all,
    })),
  };
}

// One distinct-count query per canonical theme so a place or post that touches
// several stored variants of the same theme is still counted once.
async function computeByTheme(
  ownerId: string,
  input: PlacesStatsInput,
  variants: string[],
): Promise<PlacesStatsDto["byTheme"]> {
  const identifiedFilter = placeFilterSql("p", ownerId, input, true);
  const results: PlacesStatsDto["byTheme"] = [];

  for (const theme of PLACES_ELIGIBLE_THEMES) {
    const themeVariants = variants.filter((variant) => canonicalPlacesTheme(variant) === theme);
    if (themeVariants.length === 0) {
      results.push({ theme, placeCount: 0, postCount: 0 });
      continue;
    }
    const rows = await prisma.$queryRaw<ThemeCountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT p.id)::int AS place_count,
             COUNT(DISTINCT pp.post_id)::int AS post_count
      FROM post_places pp
      JOIN places p ON p.id = pp.place_id AND p.owner_id = pp.owner_id
      JOIN posts po ON po.id = pp.post_id AND po.owner_id = pp.owner_id
      WHERE ${identifiedFilter} AND po.main_theme IN (${Prisma.join(themeVariants)})
    `);
    results.push({ theme, placeCount: rows[0]?.place_count ?? 0, postCount: rows[0]?.post_count ?? 0 });
  }

  return results;
}
