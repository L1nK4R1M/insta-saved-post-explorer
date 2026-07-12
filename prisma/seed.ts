import { ContentType, Prisma, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { foldForSearch, normalizeImportPayload, tagSlug } from "../src/lib/import/normalize";

const prisma = new PrismaClient();
const ownerId = process.env.APP_OWNER_ID?.trim() || "local";

async function main() {
  if (process.env.VERCEL_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error("Production seed is disabled. Set ALLOW_PRODUCTION_SEED=true explicitly to continue.");
  }

  const file = await readFile(
    path.join(process.cwd(), "resources", "instagram-saved-posts.sample.json"),
    "utf8",
  );
  const normalized = normalizeImportPayload(JSON.parse(file) as unknown);

  for (const source of normalized.items) {
    const post = await prisma.post.upsert({
      where: { ownerId_postUrl: { ownerId, postUrl: source.postUrl } },
      create: {
        ownerId,
        externalId: source.externalId,
        postUrl: source.postUrl,
        thumbnailUrl: source.thumbnailUrl,
        mediaUrl: source.mediaUrl,
        authorUsername: source.authorUsername,
        authorSortKey: foldForSearch(source.authorUsername),
        caption: source.caption,
        savedAt: source.savedAt,
        publishedAt: source.publishedAt,
        contentType: source.contentType.toUpperCase() as ContentType,
        mainTheme: source.mainTheme,
        metadata: source.metadata as Prisma.InputJsonValue,
        searchText: source.searchText,
      },
      update: {
        thumbnailUrl: source.thumbnailUrl,
        mediaUrl: source.mediaUrl,
        authorUsername: source.authorUsername,
        authorSortKey: foldForSearch(source.authorUsername),
        caption: source.caption,
        savedAt: source.savedAt,
        publishedAt: source.publishedAt,
        contentType: source.contentType.toUpperCase() as ContentType,
        mainTheme: source.mainTheme,
        metadata: source.metadata as Prisma.InputJsonValue,
        searchText: source.searchText,
      },
      select: { id: true },
    });

    await prisma.postTag.deleteMany({ where: { postId: post.id } });
    await prisma.postMedia.deleteMany({ where: { postId: post.id } });
    if (source.media.length > 0) {
      await prisma.postMedia.createMany({
        data: source.media.map((media) => ({
          postId: post.id,
          type: media.type.toUpperCase() as "IMAGE" | "VIDEO",
          url: media.url,
          sourcePath: media.sourcePath,
          thumbnailUrl: media.thumbnailUrl,
          position: media.position,
        })),
      });
    }
    for (const name of source.tags) {
      const tag = await prisma.tag.upsert({
        where: { ownerId_slug: { ownerId, slug: tagSlug(name) } },
        create: { ownerId, name, slug: tagSlug(name) },
        update: { name },
        select: { id: true },
      });
      await prisma.postTag.create({ data: { postId: post.id, tagId: tag.id } });
    }
  }

  console.log(`Seeded ${normalized.items.length} posts for owner ${ownerId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
