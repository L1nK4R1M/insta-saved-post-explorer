import "server-only";

import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME } from "@/auth/constants";
import {
  AuthConfigurationError,
  getAdminCredentials,
  isAuthDisabled,
} from "@/auth/config";
import { getSessionCookieOptions } from "@/auth/session";
import { createSessionToken } from "@/auth/token";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 8_192;
const loginSchema = z.object({
  password: z.string().min(1).max(1_024),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (isAuthDisabled()) {
      return NextResponse.json(
        { ok: true, bypass: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    if (
      contentType !== "application/json" ||
      (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0)) ||
      (contentLength !== null && contentLength > MAX_LOGIN_BODY_BYTES)
    ) {
      return invalidRequest();
    }

    const credentials = getAdminCredentials();
    const input = loginSchema.safeParse(await readLoginBody(request));
    if (!input.success) return invalidRequest();

    const passwordMatches = await compare(input.data.password, credentials.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "INVALID_CREDENTIALS" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE_NAME, await createSessionToken(), getSessionCookieOptions());
    return response;
  } catch (error: unknown) {
    if (error instanceof AuthConfigurationError) {
      return NextResponse.json(
        { error: "AUTH_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return invalidRequest();
  }
}

async function readLoginBody(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError("EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel("LOGIN_BODY_TOO_LARGE");
        throw new SyntaxError("LOGIN_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  return JSON.parse(text) as unknown;
}

function invalidRequest(): NextResponse {
  return NextResponse.json(
    { error: "INVALID_REQUEST" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
