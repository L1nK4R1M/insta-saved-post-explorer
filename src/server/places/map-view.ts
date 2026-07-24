import "server-only";

import { canonicalPlacesTheme, type PlacesEligibleTheme } from "@/lib/places/eligibility";
import { groupForRawCategory, type PlaceCategoryGroupKey } from "@/lib/places/categories";
import type { PlacePrecisionDto, PlaceReviewStatusDto } from "@/contracts/api/places";
import { prisma } from "@/server/db";

// Owner-scoped view model for the Phase G Places UI. The public /api/v1 list DTO
// stays unchanged; this loader exists because the map needs a little more than
// the API list exposes — the canonical source themes of the linked posts and one
// preview thumbnail for the hover callout — in a single query.
//
// The owner decided Places stays under ~1000 canonical places, so the whole set
// is loaded once and filtered in the browser: no viewport/bbox querying, no map
// pagination. MAX_PLACES is a safety cap, not a pagination scheme; when it trips
// the UI says so instead of silently showing a partial map.

export const PLACES_MAP_MAX = 1_000;

export type PlacesMapItem = {
  id: string;
  displayName: string;
  category: string | null;
  categoryGroup: PlaceCategoryGroupKey | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  precision: PlacePrecisionDto;
  confidence: number;
  approximationRadiusMeters: number | null;
  reviewStatus: PlaceReviewStatusDto;
  isUserConfirmed: boolean;
  postCount: number;
  sourceThemes: PlacesEligibleTheme[];
  previewThumbnailUrl: string | null;
};

export type PlacesMapView = {
  items: PlacesMapItem[];
  truncated: boolean;
};

export async function loadPlacesMapView(ownerId: string, max: number = PLACES_MAP_MAX): Promise<PlacesMapView> {
  const rows = await prisma.place.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: max + 1,
    select: {
      id: true,
      displayName: true,
      category: true,
      city: true,
      region: true,
      country: true,
      countryCode: true,
      latitude: true,
      longitude: true,
      precision: true,
      confidence: true,
      approximationRadiusMeters: true,
      reviewStatus: true,
      isUserConfirmed: true,
      _count: { select: { postLinks: true } },
      postLinks: {
        orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
        take: 6,
        select: { post: { select: { mainTheme: true, thumbnailUrl: true } } },
      },
    },
  });

  const truncated = rows.length > max;
  const items = (truncated ? rows.slice(0, max) : rows).map((row) => {
    const themes: PlacesEligibleTheme[] = [];
    let previewThumbnailUrl: string | null = null;
    for (const link of row.postLinks) {
      const theme = canonicalPlacesTheme(link.post.mainTheme);
      if (theme && !themes.includes(theme)) themes.push(theme);
      if (!previewThumbnailUrl && link.post.thumbnailUrl) previewThumbnailUrl = link.post.thumbnailUrl;
    }
    return {
      id: row.id,
      displayName: row.displayName,
      category: row.category,
      categoryGroup: groupForRawCategory(row.category),
      city: row.city,
      region: row.region,
      country: row.country,
      countryCode: row.countryCode,
      latitude: row.latitude,
      longitude: row.longitude,
      precision: row.precision,
      confidence: row.confidence,
      approximationRadiusMeters: row.approximationRadiusMeters,
      reviewStatus: row.reviewStatus,
      isUserConfirmed: row.isUserConfirmed,
      postCount: row._count.postLinks,
      sourceThemes: themes,
      previewThumbnailUrl,
    } satisfies PlacesMapItem;
  });

  return { items, truncated };
}
