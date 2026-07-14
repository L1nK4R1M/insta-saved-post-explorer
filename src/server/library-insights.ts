import "server-only";

import { Prisma } from "@prisma/client";

import type { ContentType, LibraryAuthor, LibraryPost, LibraryStats } from "@/features/library/types";
import { foldForSearch } from "@/lib/import/normalize";
import { databaseConfigured, prisma } from "@/server/db";
import { parseOwnerId } from "@/server/owner";

const TOP_DISTRIBUTION_LIMIT = 10;

export async function getLibraryAuthors(
  requestedOwnerId: string,
  query: string,
  limit: number,
  fallbackPosts: () => Promise<LibraryPost[]>,
): Promise<LibraryAuthor[]> {
  const ownerId = parseOwnerId(requestedOwnerId);
  const search = foldForSearch(query);
  if (!databaseConfigured) return calculateFallbackAuthors(await fallbackPosts(), search, limit);

  const rows = await prisma.post.groupBy({
    by: ["authorUsername", "authorSortKey"],
    where: { ownerId, ...(search ? { authorSortKey: { contains: search } } : {}) },
    _count: { authorUsername: true },
    orderBy: [{ _count: { authorUsername: "desc" } }, { authorSortKey: "asc" }],
    take: limit,
  });
  return rows.map((row) => ({ username: row.authorUsername, postCount: row._count.authorUsername }));
}

export function calculateFallbackAuthors(posts: LibraryPost[], search: string, limit: number): LibraryAuthor[] {
  const authors = new Map<string, LibraryAuthor>();
  for (const post of posts) {
    const key = foldForSearch(post.authorUsername);
    if (search && !key.includes(search)) continue;
    const current = authors.get(key);
    authors.set(key, { username: current?.username ?? post.authorUsername, postCount: (current?.postCount ?? 0) + 1 });
  }
  return [...authors.values()]
    .sort((a, b) => b.postCount - a.postCount || a.username.localeCompare(b.username, "fr", { sensitivity: "base" }))
    .slice(0, limit);
}

export async function getDatabaseLibraryStats(ownerIdInput: string): Promise<LibraryStats> {
  const ownerId = parseOwnerId(ownerIdInput);
  const [
    posts, media, imageMedia, videoMedia, tags, postTags, themes, mediaTypes, topAuthors,
    engagement, favorites, years,
  ] = await prisma.$transaction([
    prisma.post.count({ where: { ownerId } }),
    prisma.postMedia.count({ where: { post: { ownerId } } }),
    prisma.postMedia.count({ where: { post: { ownerId }, type: "IMAGE" } }),
    prisma.postMedia.count({ where: { post: { ownerId }, type: "VIDEO" } }),
    prisma.tag.count({ where: { ownerId } }),
    prisma.postTag.count({ where: { post: { ownerId } } }),
    prisma.post.groupBy({ by: ["mainTheme"], where: { ownerId, mainTheme: { not: null } }, _count: { mainTheme: true }, orderBy: { _count: { mainTheme: "desc" } } }),
    prisma.post.groupBy({ by: ["contentType"], where: { ownerId }, _count: { contentType: true }, orderBy: { contentType: "asc" } }),
    prisma.post.groupBy({ by: ["authorUsername", "authorSortKey"], where: { ownerId }, _count: { authorUsername: true }, orderBy: [{ _count: { authorUsername: "desc" } }, { authorSortKey: "asc" }], take: TOP_DISTRIBUTION_LIMIT }),
    prisma.post.aggregate({ where: { ownerId }, _sum: { likesCount: true, commentsCount: true }, _avg: { likesCount: true, commentsCount: true }, _count: { likesCount: true, commentsCount: true, authorUsername: true } }),
    prisma.post.count({ where: { ownerId, OR: [{ collectionPosts: { some: { collection: { ownerId, slug: "favoris", isPublic: true } } } }, { postTags: { some: { tag: { ownerId, slug: "favoris" } } } }] } }),
    prisma.$queryRaw<Array<{ year: number; count: bigint }>>(Prisma.sql`SELECT EXTRACT(YEAR FROM "published_at")::integer AS year, COUNT(*)::bigint AS count FROM "posts" WHERE "owner_id" = ${ownerId} AND "published_at" IS NOT NULL GROUP BY 1 ORDER BY 1 DESC`),
  ]);

  const contentCounts = new Map(mediaTypes.map((row) => [row.contentType, groupedCount(row._count, "contentType")]));
  const authorCountRows = await prisma.post.groupBy({ by: ["authorSortKey"], where: { ownerId } });
  return {
    posts,
    photos: contentCounts.get("IMAGE") ?? 0,
    carousels: contentCounts.get("CAROUSEL") ?? 0,
    videos: contentCounts.get("REEL") ?? 0,
    otherPosts: contentCounts.get("OTHER") ?? 0,
    media, imageMedia, videoMedia, tags,
    mainThemes: themes.length,
    authors: authorCountRows.length,
    favorites,
    totalLikes: engagement._sum.likesCount ?? 0,
    totalComments: engagement._sum.commentsCount ?? 0,
    averages: {
      likesPerRatedPost: round(engagement._avg.likesCount ?? 0),
      commentsPerRatedPost: round(engagement._avg.commentsCount ?? 0),
      mediaPerPost: round(posts ? media / posts : 0),
      tagsPerPost: round(posts ? postTags / posts : 0),
    },
    distributions: {
      themes: themes.flatMap((row) => row.mainTheme ? [{ name: row.mainTheme, count: groupedCount(row._count, "mainTheme") }] : []),
      years: years.map((row) => ({ year: row.year, count: Number(row.count) })),
      topAuthors: topAuthors.map((row) => ({ username: row.authorUsername, postCount: groupedCount(row._count, "authorUsername") })),
      mediaTypes: (["IMAGE", "CAROUSEL", "REEL", "OTHER"] as const).map((type) => ({ type: type.toLowerCase() as ContentType, count: contentCounts.get(type) ?? 0 })),
    },
  };
}

export function calculateDetailedFallbackStats(posts: LibraryPost[]): LibraryStats {
  const media = posts.flatMap((post) => post.media);
  const themes = countBy(posts.flatMap((post) => post.mainTheme ? [post.mainTheme] : []));
  const years = countBy(posts.flatMap((post) => post.publishedAt ? [String(new Date(post.publishedAt).getUTCFullYear())] : []));
  const ratedLikes = posts.filter((post) => post.likesCount !== null);
  const ratedComments = posts.filter((post) => post.commentsCount !== null);
  const contentCount = (type: ContentType) => posts.filter((post) => post.contentType === type).length;
  return {
    posts: posts.length, photos: contentCount("image"), carousels: contentCount("carousel"), videos: contentCount("reel"), otherPosts: contentCount("other"),
    media: media.length, imageMedia: media.filter((item) => item.type === "image").length, videoMedia: media.filter((item) => item.type === "video").length,
    tags: new Set(posts.flatMap((post) => post.tags)).size, mainThemes: themes.length,
    authors: new Set(posts.map((post) => foldForSearch(post.authorUsername))).size,
    favorites: posts.filter((post) => post.collections.includes("favoris") || post.tags.some((tag) => foldForSearch(tag) === "favoris")).length,
    totalLikes: ratedLikes.reduce((sum, post) => sum + (post.likesCount ?? 0), 0),
    totalComments: ratedComments.reduce((sum, post) => sum + (post.commentsCount ?? 0), 0),
    averages: {
      likesPerRatedPost: round(average(ratedLikes.map((post) => post.likesCount ?? 0))),
      commentsPerRatedPost: round(average(ratedComments.map((post) => post.commentsCount ?? 0))),
      mediaPerPost: round(posts.length ? media.length / posts.length : 0),
      tagsPerPost: round(posts.length ? posts.reduce((sum, post) => sum + post.tags.length, 0) / posts.length : 0),
    },
    distributions: {
      themes: themes.map(([name, count]) => ({ name, count })),
      years: years.map(([year, count]) => ({ year: Number(year), count })).sort((a, b) => b.year - a.year),
      topAuthors: calculateFallbackAuthors(posts, "", TOP_DISTRIBUTION_LIMIT),
      mediaTypes: (["image", "carousel", "reel", "other"] as const).map((type) => ({ type, count: contentCount(type) })),
    },
  };
}

function countBy(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
}
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number): number { return Math.round(value * 100) / 100; }
function groupedCount(value: unknown, field: string): number {
  if (!value || typeof value !== "object") return 0;
  const count = (value as Record<string, unknown>)[field];
  return typeof count === "number" ? count : 0;
}
