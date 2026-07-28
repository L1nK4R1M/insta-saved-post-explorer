export type SyncKnownPost = {
  externalId: string | null;
  postCode: string | null;
};

export function buildSyncKnownPosts(
  posts: Array<{ externalId: string | null; postUrl: string }>,
): SyncKnownPost[] {
  return posts.map((post) => {
    let postCode: string | null = null;
    try {
      postCode = new URL(post.postUrl).pathname.split("/").filter(Boolean).at(-1) ?? null;
    } catch {
      postCode = null;
    }
    return { externalId: post.externalId, postCode };
  });
}
