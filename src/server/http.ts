import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

export const MAX_IMPORT_BODY_BYTES = 1_000_000;
const importBodyLimitSchema = z.coerce.number().int().min(1_024).max(MAX_IMPORT_BODY_BYTES);

export function getImportBodyLimit(): number {
  const parsed = importBodyLimitSchema.safeParse(
    process.env.IMPORT_MAX_BYTES ?? MAX_IMPORT_BODY_BYTES,
  );
  return parsed.success ? parsed.data : MAX_IMPORT_BODY_BYTES;
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("REQUEST_BODY_TOO_LARGE");
    this.name = "RequestBodyTooLargeError";
  }
}

export class UnsupportedMediaTypeError extends Error {
  constructor() {
    super("UNSUPPORTED_MEDIA_TYPE");
    this.name = "UnsupportedMediaTypeError";
  }
}

export async function readBoundedJsonBody(
  request: Request,
  maxBytes = MAX_IMPORT_BODY_BYTES,
): Promise<unknown> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw new UnsupportedMediaTypeError();

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) throw new SyntaxError("INVALID_LENGTH");
    if (parsedLength > maxBytes) throw new RequestBodyTooLargeError();
  }

  if (!request.body) throw new SyntaxError("EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("REQUEST_BODY_TOO_LARGE");
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return JSON.parse(text) as unknown;
  } catch {
    throw new SyntaxError("INVALID_JSON");
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnsupportedMediaTypeError) {
    return NextResponse.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        ...(process.env.NODE_ENV === "development"
          ? { fields: [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "input")))] }
          : {}),
      },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }
  if (error instanceof Error && error.message === "IMPORT_ALREADY_STARTED") {
    return NextResponse.json({ error: "IMPORT_ALREADY_STARTED" }, { status: 409 });
  }
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
