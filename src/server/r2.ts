import "server-only";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const configSchema = z.object({
  endpoint: z.string().url().startsWith("https://"),
  bucket: z.string().trim().min(1),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
});

const uploadSchema = z.object({
  authorUsername: z.string().trim().min(1).max(128),
  postCode: z.string().trim().regex(/^[A-Za-z0-9_-]{3,128}$/),
  position: z.number().int().min(0).max(19),
  carousel: z.boolean(),
  kind: z.enum(["image", "video", "thumbnail"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
  byteSize: z.number().int().positive().max(250 * 1024 * 1024),
});

let client: S3Client | null = null;

function config() {
  return configSchema.parse({
    endpoint: process.env.R2_ENDPOINT,
    bucket: process.env.R2_BUCKET_NAME,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  });
}

function r2Client() {
  if (client) return client;
  const value = config();
  client = new S3Client({
    region: "auto",
    endpoint: value.endpoint,
    credentials: {
      accessKeyId: value.accessKeyId,
      secretAccessKey: value.secretAccessKey,
    },
  });
  return client;
}

export async function prepareR2Upload(input: z.input<typeof uploadSchema>) {
  const value = uploadSchema.parse(input);
  const { bucket, objectKey, relativePath } = objectTarget(value);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: value.contentType,
  });
  const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 15 * 60 });
  return { uploadUrl, objectKey, sourcePath: relativePath, contentType: value.contentType };
}

export async function uploadR2Object(
  input: z.input<typeof uploadSchema>,
  body: Uint8Array,
) {
  const value = uploadSchema.parse(input);
  if (body.byteLength !== value.byteSize) throw new Error("R2_OBJECT_MISMATCH");
  const target = objectTarget(value);
  await r2Client().send(new PutObjectCommand({
    Bucket: target.bucket,
    Key: target.objectKey,
    ContentType: value.contentType,
    Body: body,
  }));
  return {
    objectKey: target.objectKey,
    sourcePath: target.relativePath,
    contentType: value.contentType,
  };
}

export async function verifyR2Object(objectKey: string, expectedSize: number) {
  const { bucket } = config();
  const result = await r2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (result.ContentLength !== expectedSize) throw new Error("R2_OBJECT_MISMATCH");
  return { etag: result.ETag ?? null, contentType: result.ContentType ?? null };
}

export function validateR2ObjectReference(input: {
  objectKey: string;
  sourcePath: string;
  authorUsername: string;
  postCode: string;
  position: number;
  carousel: boolean;
  kind: "image" | "video" | "thumbnail";
}) {
  const prefix = safePrefix(process.env.MEDIA_PATH_PREFIX ?? "originals");
  const author = safeSegment(input.authorUsername);
  const position = input.carousel ? `_${input.position + 1}` : "";
  const kind = input.kind === "thumbnail" ? `${position}_thumb` : position;
  const escapedCode = escapeRegExp(input.postCode);
  const extension = input.kind === "video" ? "mp4" : "(?:jpg|png|webp)";
  const expected = new RegExp(`^${escapeRegExp(prefix)}/${escapeRegExp(author)}/${escapedCode}${kind}\\.${extension}$`);
  if (!expected.test(input.objectKey) || input.objectKey !== `${prefix}/${input.sourcePath}`) {
    throw new Error("INVALID_R2_OBJECT_REFERENCE");
  }
}

export function publicMediaUrl(objectKey: string): string {
  const base = z.string().url().parse(process.env.MEDIA_PUBLIC_BASE_URL);
  return new URL(objectKey.split("/").map(encodeURIComponent).join("/"), ensureSlash(base)).toString();
}

function extensionFor(contentType: string) {
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
}

export async function r2ObjectExists(objectKey: string): Promise<boolean> {
  try {
    const { bucket } = config();
    await r2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return true;
  } catch (error) {
    const status = typeof error === "object" && error && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (status === 404) return false;
    throw error;
  }
}

export function objectKeyFromPublicMediaUrl(value: string): string {
  const base = new URL(ensureSlash(z.string().url().parse(process.env.MEDIA_PUBLIC_BASE_URL)));
  const url = new URL(value);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error("INVALID_PUBLIC_MEDIA_URL");
  }
  return url.pathname
    .slice(base.pathname.length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

function objectTarget(value: z.infer<typeof uploadSchema>) {
  const extension = extensionFor(value.contentType);
  const suffix = value.carousel ? `_${value.position + 1}` : "";
  const fileSuffix = value.kind === "thumbnail" ? `${suffix}_thumb` : suffix;
  const relativePath = `${safeSegment(value.authorUsername)}/${value.postCode}${fileSuffix}.${extension}`;
  const prefix = safePrefix(process.env.MEDIA_PATH_PREFIX ?? "originals");
  return {
    bucket: config().bucket,
    relativePath,
    objectKey: `${prefix}/${relativePath}`,
  };
}

function safeSegment(value: string) {
  const normalized = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  if (!normalized) throw new Error("INVALID_MEDIA_PATH");
  return normalized;
}

function safePrefix(value: string) {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) throw new Error("INVALID_MEDIA_PREFIX");
  return normalized;
}

function ensureSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
