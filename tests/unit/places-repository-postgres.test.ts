// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("server-only", () => ({}));

// Real PostgreSQL exercise of the owner-scoped analysis repository.
// Skipped without TEST_DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? "";
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const OWNER_A = "owner-repo-a";
const OWNER_B = "owner-repo-b";

let prisma: PrismaClient;
let repository: typeof import("@/server/places/repository");
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithDatabase("Places analysis repository on PostgreSQL", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/server/db"));
    repository = await import("@/server/places/repository");
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await prisma.$disconnect();
    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  beforeEach(resetDatabase);

  it("excludes a verified media row whose denormalized owner does not match", async () => {
    const postId = await seedPost(OWNER_A);
    // Legitimate verified media owned by the post owner.
    await prisma.postMedia.create({
      data: {
        postId,
        ownerId: OWNER_A,
        type: "IMAGE",
        url: "https://example.com/a.jpg",
        position: 0,
        objectKey: "owner-a/object-key",
        versionTag: "v-a",
        identityState: "VERIFIED",
      },
    });
    // Mismatched media: attached to owner A's post but carrying owner B's id.
    // post_media has no composite owner guard (out of Places scope), so this row
    // is insertable and proves the query must scope ownerId explicitly.
    await prisma.postMedia.create({
      data: {
        postId,
        ownerId: OWNER_B,
        type: "IMAGE",
        url: "https://example.com/b.jpg",
        position: 1,
        objectKey: "owner-b/object-key",
        versionTag: "v-b",
        identityState: "VERIFIED",
      },
    });

    const inputs = await repository.loadAnalysisPostInputs(OWNER_A, postId);
    expect(inputs).not.toBeNull();
    const keys = inputs!.verifiedMedia.map((media) => media.objectKey);
    expect(keys).toEqual(["owner-a/object-key"]);
    expect(keys).not.toContain("owner-b/object-key");
  });

  it("excludes an internal tag whose owner does not match the post owner", async () => {
    const postId = await seedPost(OWNER_A);
    const tagA = await prisma.tag.create({
      data: { ownerId: OWNER_A, name: "owner-a-tag", slug: "owner-a-tag" },
      select: { id: true },
    });
    const tagB = await prisma.tag.create({
      data: { ownerId: OWNER_B, name: "owner-b-tag", slug: "owner-b-tag" },
      select: { id: true },
    });
    // Legitimate same-owner link.
    await prisma.postTag.create({ data: { postId, tagId: tagA.id } });
    // Deliberately cross-owner link: PostTag binds only post_id and tag_id, so
    // this malformed row is insertable and proves the query must scope the tag
    // owner explicitly.
    await prisma.postTag.create({ data: { postId, tagId: tagB.id } });

    const inputs = await repository.loadAnalysisPostInputs(OWNER_A, postId);
    expect(inputs).not.toBeNull();
    expect(inputs!.internalTags).toEqual(["owner-a-tag"]);
    expect(inputs!.internalTags).not.toContain("owner-b-tag");
  });
});

let postCounter = 0;

async function seedPost(ownerId: string): Promise<string> {
  postCounter += 1;
  const post = await prisma.post.create({
    data: {
      ownerId,
      postUrl: `https://instagram.com/p/PR${postCounter}`,
      thumbnailUrl: "https://example.com/t.jpg",
      authorUsername: "alice",
      authorSortKey: "alice",
      caption: "A trip",
      searchText: "alice trip",
      contentType: "IMAGE",
      mainTheme: "Voyages",
    },
    select: { id: true },
  });
  return post.id;
}

async function resetDatabase(): Promise<void> {
  const owners = { ownerId: { in: [OWNER_A, OWNER_B] } };
  await prisma.post.deleteMany({ where: owners });
  await prisma.tag.deleteMany({ where: owners });
}
