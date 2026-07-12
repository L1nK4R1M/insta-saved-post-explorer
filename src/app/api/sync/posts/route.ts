import { NextResponse } from "next/server";
import { z } from "zod";

import { importPosts } from "@/server/import-posts";
import { prisma } from "@/server/db";
import { publicMediaUrl, validateR2ObjectReference, verifyR2Object } from "@/server/r2";
import { requireSyncToken } from "@/server/sync-auth";

const uploadedMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  objectKey: z.string().min(1).max(1024),
  sourcePath: z.string().min(1).max(1024),
  byteSize: z.number().int().positive(),
  thumbnailObjectKey: z.string().min(1).max(1024).nullable().optional(),
  thumbnailByteSize: z.number().int().positive().nullable().optional(),
});

const postSchema = z.object({
  external_id: z.union([z.string(), z.number()]).transform(String),
  post_url: z.string(),
  username: z.string(),
  caption: z.string().default(""),
  published_at: z.string().nullable().optional(),
  content_type: z.enum(["image", "carousel", "reel"]),
  likes_count: z.number().int().nonnegative().nullable().optional(),
  comments_count: z.number().int().nonnegative().nullable().optional(),
  media: z.array(uploadedMediaSchema).min(1).max(20),
});

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const claims = await requireSyncToken(request);
    const post = postSchema.parse(await request.json());
    const postCode = new URL(post.post_url).pathname.split("/").filter(Boolean).at(-1) ?? "";
    for (const [position, media] of post.media.entries()) {
      validateR2ObjectReference({
        objectKey: media.objectKey,
        sourcePath: media.sourcePath,
        authorUsername: post.username,
        postCode,
        position,
        carousel: post.content_type === "carousel",
        kind: media.type,
      });
      await verifyR2Object(media.objectKey, media.byteSize);
      if (media.thumbnailObjectKey && media.thumbnailByteSize) {
        validateR2ObjectReference({
          objectKey: media.thumbnailObjectKey,
          sourcePath: media.thumbnailObjectKey.replace(`${process.env.MEDIA_PATH_PREFIX ?? "originals"}/`, ""),
          authorUsername: post.username,
          postCode,
          position,
          carousel: post.content_type === "carousel",
          kind: "thumbnail",
        });
        await verifyR2Object(media.thumbnailObjectKey, media.thumbnailByteSize);
      }
    }
    const media = post.media.map((item) => ({
      type: item.type,
      source_path: item.sourcePath,
      url: publicMediaUrl(item.objectKey),
      thumbnail_url: item.thumbnailObjectKey ? publicMediaUrl(item.thumbnailObjectKey) : null,
    }));
    const canonicalPostUrl = post.post_url.replace(/\/+$/, "");
    const existing = await prisma.post.findUnique({
      where: { ownerId_postUrl: { ownerId: claims.ownerId, postUrl: canonicalPostUrl } },
      include: { postTags: { include: { tag: true } } },
    });
    const existingMetadata = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : {};
    const report = await importPosts([{
      external_id: post.external_id,
      post_url: canonicalPostUrl,
      username: post.username,
      caption: post.caption,
      thumbnail_url: media[0].thumbnail_url ?? media[0].url,
      media_url: media[0].url,
      media,
      published_at: post.published_at,
      content_type: post.content_type,
      likes_count: post.likes_count,
      comments_count: post.comments_count,
      saved_at: existing?.savedAt?.toISOString() ?? undefined,
      main_theme: existing?.mainTheme ?? undefined,
      tags: existing?.postTags.map((postTag) => postTag.tag.name) ?? [],
      metadata: { ...existingMetadata, sync_job_id: claims.sub },
    }], {
      ownerId: claims.ownerId,
      sourceName: "instagram-extension-sync",
      idempotencyKey: `${claims.sub}:${post.external_id}`.slice(0, 128),
      batchSize: 1,
    });
    await prisma.syncJob.updateMany({
      where: { id: claims.sub, ownerId: claims.ownerId },
      data: {
        status: "RUNNING",
        collected: { increment: 1 },
        imported: { increment: report.imported },
        updated: { increment: report.updated },
        mediaUploaded: { increment: post.media.length },
        heartbeatAt: new Date(),
      },
    });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: message }, { status: message === "SYNC_UNAUTHORIZED" ? 401 : 400 });
  }
}
