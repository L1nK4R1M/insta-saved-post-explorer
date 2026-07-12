export function resolvePublicMediaUrl(
  sourcePath: string | null,
  fallbackUrl: string | null,
  options?: { type?: "image" | "video"; position?: number; mediaCount?: number; thumbnail?: boolean },
): string | null {
  if (!sourcePath) return fallbackUrl;
  const baseUrl = parsePublicMediaBaseUrl(process.env.MEDIA_PUBLIC_BASE_URL);
  if (!baseUrl) return fallbackUrl;

  const prefix = normalizePrefix(process.env.MEDIA_PATH_PREFIX ?? "originals");
  const r2Path = toR2ObjectPath(sourcePath, options);
  const objectKey = [prefix, r2Path].filter(Boolean).join("/");
  const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
  return new URL(encodedKey, baseUrl).toString();
}

export function toR2ObjectPath(
  sourcePath: string,
  options?: { type?: "image" | "video"; position?: number; mediaCount?: number; thumbnail?: boolean },
): string {
  const segments = sourcePath.split("/");
  if (segments.length < 2) return sourcePath;
  const username = segments[0];
  if (segments.length === 2) {
    const filename = options?.thumbnail
      ? segments[1].replace(/\.[^.]+$/, ".jpg")
      : segments[1];
    return `${username}/${filename}`;
  }
  const code = segments[1];
  const position = options?.position ?? 0;
  const mediaCount = options?.mediaCount ?? 1;
  const extension = options?.thumbnail || options?.type !== "video" ? "jpg" : "mp4";
  const filename = mediaCount > 1 ? `${code}_${position + 1}.${extension}` : `${code}.${extension}`;
  return `${username}/${filename}`;
}

export function parsePublicMediaBaseUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim().replace(/\/+$/, "") + "/");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function normalizePrefix(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}
