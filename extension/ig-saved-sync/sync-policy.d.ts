export type SyncFeedPost = {
  pk: string | number;
  code?: string | number | null;
  [key: string]: unknown;
};

export type SyncPostIdentity = {
  pk?: string | number | null;
  code?: string | number | null;
  externalId?: string | number | null;
  postCode?: string | number | null;
};

export function canonicalizePostIdentities(
  ...groups: Array<Array<SyncPostIdentity | string | number>>
): Array<{ pk: string | null; code: string | null }>;

export function isFeedPageTerminal(input: {
  currentCursor: string | number | null | undefined;
  nextCursor: string | number | null | undefined;
  moreAvailable: boolean;
}): boolean;

export function buildWebsiteReconciliationTargets(
  extensionArchivePosts: Array<SyncPostIdentity | string | number>,
  websiteKnownPosts: Array<SyncPostIdentity | string | number>,
): string[];

export function reconciliationCompletionError(
  remainingTargetIds: Array<string | number>,
): string | null;

export function selectWebsiteReconciliationPage<T extends SyncFeedPost>(
  posts: T[],
  websiteKnownIdentifiers: Set<string>,
  pendingTargetIds: Array<string | number>,
): {
  fresh: T[];
  remainingTargetIds: string[];
  pendingUploadTargetIds: string[];
  stopEarly: boolean;
};

export function synchronizeWebsitePage<T extends SyncFeedPost>(
  posts: T[],
  uploadPost: (post: T) => Promise<number>,
  recordUploadedPost: (post: T, uploadedMediaCount: number) => Promise<void>,
  commitPage: () => Promise<void>,
): Promise<void>;

export function selectLocalIncrementalPage<T extends SyncFeedPost>(
  posts: T[],
  archiveKnownIdentifiers: Set<string>,
): {
  fresh: T[];
  stopEarly: boolean;
};
