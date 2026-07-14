import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse } from "@/auth/http";
import { requireSession } from "@/auth/session";
import { prisma } from "@/server/db";
import { objectKeyFromPublicMediaUrl, publicMediaUrl, r2ObjectExists, uploadR2Object } from "@/server/r2";

const requestSchema = z.object({
  items: z.array(z.object({
    postUrl: z.string().url(),
    position: z.number().int().min(0).max(19),
    sourceUrl: z.string().url(),
  })).min(1).max(10),
});

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_SOURCE_HOSTS = ["cdninstagram.com", "fbcdn.net"];

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { items } = requestSchema.parse(await request.json());
    const results = await Promise.all(items.map(async (item) => {
      try {
        const postUrl = canonicalPostUrl(item.postUrl);
        const post = await prisma.post.findUnique({
          where: { ownerId_postUrl: { ownerId: session.ownerId, postUrl } },
          select: {
            id: true,
            authorUsername: true,
            postUrl: true,
            contentType: true,
            media: {
              where: { position: item.position },
              select: { id: true, type: true, thumbnailUrl: true },
              take: 1,
            },
          },
        });
        const media = post?.media[0];
        if (!post || !media) return { status: "skipped", reason: "MEDIA_NOT_FOUND" } as const;
        if (media.type !== "VIDEO") return { status: "skipped", reason: "NOT_A_VIDEO" } as const;
        if (media.thumbnailUrl) {
          try {
            if (await r2ObjectExists(objectKeyFromPublicMediaUrl(media.thumbnailUrl))) {
              return { status: "skipped", reason: "ALREADY_AVAILABLE" } as const;
            }
          } catch (error) {
            if (!(error instanceof Error) || error.message !== "INVALID_PUBLIC_MEDIA_URL") throw error;
          }
        }

        const image = await downloadImage(item.sourceUrl);
        const postCode = new URL(post.postUrl).pathname.split("/").filter(Boolean).at(-1);
        if (!postCode) return { status: "skipped", reason: "INVALID_POST_URL" } as const;
        const stored = await uploadR2Object({
          authorUsername: post.authorUsername,
          postCode,
          position: item.position,
          carousel: post.contentType === "CAROUSEL",
          kind: "thumbnail",
          contentType: image.contentType,
          byteSize: image.bytes.byteLength,
        }, image.bytes);
        const thumbnailUrl = publicMediaUrl(stored.objectKey);

        await prisma.$transaction([
          prisma.postMedia.update({ where: { id: media.id }, data: { thumbnailUrl } }),
          ...(item.position === 0
            ? [prisma.post.update({ where: { id: post.id }, data: { thumbnailUrl } })]
            : []),
        ]);
        return { status: "repaired", thumbnailUrl } as const;
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : "REPAIR_FAILED",
        } as const;
      }
    }));

    return NextResponse.json({
      repaired: results.filter((result) => result.status === "repaired").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function downloadImage(rawUrl: string) {
  let url = safeSourceUrl(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("INVALID_SOURCE_REDIRECT");
      url = safeSourceUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    const contentType = normalizedImageType(response.headers.get("content-type"));
    const announcedSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(announcedSize) && announcedSize > MAX_IMAGE_BYTES) {
      throw new Error("SOURCE_IMAGE_TOO_LARGE");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("SOURCE_IMAGE_SIZE_INVALID");
    }
    return { bytes, contentType };
  }
  throw new Error("TOO_MANY_SOURCE_REDIRECTS");
}

function safeSourceUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !ALLOWED_SOURCE_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    throw new Error("INVALID_SOURCE_URL");
  }
  return url;
}

function normalizedImageType(value: string | null): "image/jpeg" | "image/png" | "image/webp" {
  const type = String(value ?? "").split(";", 1)[0].toLowerCase();
  if (type === "image/jpeg" || type === "image/png" || type === "image/webp") return type;
  throw new Error("INVALID_SOURCE_CONTENT_TYPE");
}

function canonicalPostUrl(value: string): string {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  const code = parts[1];
  if (url.hostname !== "www.instagram.com" || !["p", "reel", "tv"].includes(parts[0] ?? "") || !code) {
    throw new Error("INVALID_POST_URL");
  }
  return `https://www.instagram.com/p/${code}`;
}
