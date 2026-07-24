import { z } from "zod";

import { canonicalPlacesTheme, type PlacesEligibleTheme } from "@/lib/places/eligibility";

// Public DTOs and request parsers for the read-only /api/v1/places surface.
// DTOs are explicit and stable: routes and services never return raw Prisma
// objects, provider payloads, secrets, or another owner's data.

export const PLACE_PRECISIONS = ["EXACT", "PROBABLE", "APPROXIMATE"] as const;
export const PLACE_REVIEW_STATUSES = ["UNREVIEWED", "CONFIRMED", "REJECTED", "CONFLICT"] as const;

export type PlacePrecisionDto = (typeof PLACE_PRECISIONS)[number];
export type PlaceReviewStatusDto = (typeof PLACE_REVIEW_STATUSES)[number];

export type PlacePage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type PlaceListItemDto = {
  id: string;
  displayName: string;
  category: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  continentCode: string | null;
  latitude: number;
  longitude: number;
  precision: PlacePrecisionDto;
  confidence: number;
  approximationRadiusMeters: number | null;
  reviewStatus: PlaceReviewStatusDto;
  isUserConfirmed: boolean;
  postCount: number;
  updatedAt: string;
};

export type PlaceEvidenceDto = {
  type: string;
  normalizedValue: string | null;
  excerpt: string | null;
  confidence: number;
};

export type PlaceDetailDto = PlaceListItemDto & {
  createdAt: string;
  address: string | null;
  provider: string;
  providerResultType: string | null;
  attribution: string | null;
  evidence: PlaceEvidenceDto[];
};

export type PlacePostSummaryDto = {
  postId: string;
  postUrl: string;
  thumbnailUrl: string;
  authorUsername: string;
  mainTheme: string | null;
  isPrimary: boolean;
  precision: PlacePrecisionDto;
  confidence: number;
  linkedAt: string;
};

export type EligiblePostDto = {
  postId: string;
  postUrl: string;
  thumbnailUrl: string;
  authorUsername: string;
  mainTheme: string | null;
  savedAt: string | null;
};

export type UnresolvedJobDto = {
  jobId: string;
  postId: string;
  status: string;
  stage: string;
  sourceTheme: string;
  createdAt: string;
};

export type PlaceAnalysisJobDto = {
  jobId: string;
  postId: string;
  status: string;
  stage: string;
  depth: string;
  sourceTheme: string;
  analysisVersion: string;
  attemptCount: number;
  errorCode: string | null;
  result: unknown;
  createdAt: string;
  completedAt: string | null;
};

export type PlacesStatsDto = {
  totals: {
    eligiblePosts: number;
    identifiedPlaces: number;
    countries: number;
    continents: number;
    postsWithPlaces: number;
    needsReview: number;
  };
  byTheme: Array<{ theme: string; placeCount: number; postCount: number }>;
  byCountry: Array<{ countryCode: string; country: string | null; placeCount: number; postCount: number }>;
  byContinent: Array<{ continentCode: string; placeCount: number; countryCount: number; postCount: number }>;
  byPrecision: Array<{ precision: PlacePrecisionDto; placeCount: number }>;
  byReviewStatus: Array<{ reviewStatus: PlaceReviewStatusDto; placeCount: number }>;
};

// ---- Request parsers -------------------------------------------------------

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 100;

function boundedLimit(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return LIMIT_DEFAULT;
  return Math.min(LIMIT_MAX, Math.max(1, value));
}

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .optional();

const placesListSchema = z.object({
  cursor: z.string().trim().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(LIMIT_MAX),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  continentCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  reviewStatus: z.enum(PLACE_REVIEW_STATUSES).optional(),
  precision: z.enum(PLACE_PRECISIONS).optional(),
  city: optionalTrimmed(200),
  category: optionalTrimmed(100),
  minConfidence: z.number().min(0).max(1).optional(),
  q: optionalTrimmed(200),
});

export type PlacesListInput = z.infer<typeof placesListSchema>;

export function parsePlacesListParams(searchParams: URLSearchParams): PlacesListInput {
  const minConfidenceRaw = searchParams.get("min_confidence");
  return placesListSchema.parse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: boundedLimit(searchParams.get("limit")),
    countryCode: searchParams.get("country_code") ?? undefined,
    continentCode: searchParams.get("continent_code") ?? undefined,
    reviewStatus: searchParams.get("review_status") ?? undefined,
    precision: searchParams.get("precision") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    minConfidence: minConfidenceRaw != null ? Number(minConfidenceRaw) : undefined,
    q: searchParams.get("q") ?? undefined,
  });
}

const cursorPageSchema = z.object({
  cursor: z.string().trim().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(LIMIT_MAX),
});

export type CursorPageInput = z.infer<typeof cursorPageSchema>;

export function parseCursorPageParams(searchParams: URLSearchParams): CursorPageInput {
  return cursorPageSchema.parse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: boundedLimit(searchParams.get("limit")),
  });
}

const statsSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  continentCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  precision: z.enum(PLACE_PRECISIONS).optional(),
  // source_theme is normalized through the shared Places predicate: any case or
  // accent variant that folds to Voyages/Restaurant is accepted and canonicalized;
  // everything else (Voyage, Restaurants, Cuisine, Lieux, empty, unknown) is null
  // and rejected as a 400. There is no independent theme list here.
  sourceTheme: z
    .string()
    .trim()
    .transform((value) => canonicalPlacesTheme(value))
    .refine((value): value is PlacesEligibleTheme => value !== null, {
      message: "source_theme must be Voyages or Restaurant",
    })
    .optional(),
});

export type PlacesStatsInput = z.infer<typeof statsSchema>;

export function parsePlacesStatsParams(searchParams: URLSearchParams): PlacesStatsInput {
  return statsSchema.parse({
    countryCode: searchParams.get("country_code") ?? undefined,
    continentCode: searchParams.get("continent_code") ?? undefined,
    precision: searchParams.get("precision") ?? undefined,
    sourceTheme: searchParams.get("source_theme") ?? undefined,
  });
}
