export const contentTypes = ["image", "carousel", "reel", "other"] as const;

export type ContentType = (typeof contentTypes)[number];

export type LibraryPost = {
  id: string;
  externalId: string | null;
  postUrl: string;
  thumbnailUrl: string;
  mediaUrl: string | null;
  authorUsername: string;
  caption: string;
  tags: string[];
  savedAt: string | null;
  publishedAt: string | null;
  contentType: ContentType;
  mainTheme: string | null;
  metadata: Record<string, unknown>;
};

export type TagMode = "and" | "or";
export type ViewMode = "grid" | "masonry";
export type SortMode = "newest" | "oldest" | "author" | "relevance";
