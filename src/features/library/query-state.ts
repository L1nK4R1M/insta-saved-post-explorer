import { z } from "zod";

import type { SortMode, TagMode } from "@/features/library/types";

export type ContentTypeFilter = "image" | "carousel" | "reel";

export const DEFAULT_LIBRARY_LIMIT = 30;
export const MAX_LIBRARY_LIMIT = 100;

export type LibraryQuery = {
  search: string;
  tags: string[];
  theme: string | null;
  contentType: ContentTypeFilter | null;
  author: string | null;
  year: number | null;
  collection: string | null;
  tagMode: TagMode;
  sort: SortMode;
  cursor: string | null;
  limit: number;
};

export type LibraryCursor = {
  version: 1;
  sort: SortMode;
  value: string | null;
  id: string;
};

const querySchema = z.object({
  search: z.string().trim().max(200).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  tagMode: z.enum(["and", "or"]).default("and"),
  theme: z.string().trim().min(1).max(120).nullable().default(null),
  contentType: z.enum(["image", "carousel", "reel"]).nullable().default(null),
  author: z.string().trim().min(1).max(80).nullable().default(null),
  year: z.coerce.number().int().min(1900).max(2100).nullable().default(null),
  collection: z.string().trim().min(1).max(80).nullable().default(null),
  sort: z.enum(["newest", "oldest", "author", "relevance", "likes"]).default("newest"),
  cursor: z.string().trim().min(1).max(1_024).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(MAX_LIBRARY_LIMIT).default(DEFAULT_LIBRARY_LIMIT),
});

const cursorSchema = z.object({
  version: z.literal(1),
  sort: z.enum(["newest", "oldest", "author", "relevance", "likes"]),
  value: z.string().max(1_024).nullable(),
  id: z.string().min(1).max(256),
});

export function parseLibraryQuery(input: {
  search?: unknown;
  tags?: unknown;
  theme?: unknown;
  contentType?: unknown;
  author?: unknown;
  year?: unknown;
  collection?: unknown;
  tagMode?: unknown;
  sort?: unknown;
  cursor?: unknown;
  limit?: unknown;
}): LibraryQuery {
  return querySchema.parse({
    ...input,
    tags: normalizeTags(input.tags),
    theme: input.theme === undefined || input.theme === "" ? null : input.theme,
    contentType: input.contentType === undefined || input.contentType === "" ? null : input.contentType,
    author: input.author === undefined || input.author === "" ? null : input.author,
    year: input.year === undefined || input.year === "" ? null : input.year,
    collection: input.collection === undefined || input.collection === "" ? null : input.collection,
    cursor: input.cursor === undefined || input.cursor === "" ? null : input.cursor,
  });
}

export function parseLibrarySearchParams(searchParams: URLSearchParams): LibraryQuery {
  const repeatedTags = searchParams.getAll("tag");
  const tags = repeatedTags.length > 0 ? repeatedTags : searchParams.get("tags") ?? undefined;

  return parseLibraryQuery({
    search: searchParams.get("search") ?? searchParams.get("q") ?? undefined,
    tags,
    theme: searchParams.get("theme") ?? undefined,
    contentType: searchParams.get("type") ?? undefined,
    author: searchParams.get("author") ?? undefined,
    year: searchParams.get("year") ?? undefined,
    collection: searchParams.get("collection") ?? undefined,
    tagMode: searchParams.get("tagMode") ?? searchParams.get("tag_mode") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
}

export function encodeLibraryCursor(cursor: LibraryCursor): string {
  const validated = cursorSchema.parse(cursor);
  const bytes = new TextEncoder().encode(JSON.stringify(validated));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeLibraryCursor(value: string, expectedSort?: SortMode): LibraryCursor {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const cursor = cursorSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (expectedSort && cursor.sort !== expectedSort) throw new Error("CURSOR_SORT_MISMATCH");
    return cursor;
  } catch {
    throw new z.ZodError([
      { code: "custom", path: ["cursor"], message: "Curseur invalide" },
    ]);
  }
}

function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  const tags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [value];
  return [...new Set(tags.map((tag) => (typeof tag === "string" ? tag.trim() : tag)))];
}
