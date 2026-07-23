// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { z } from "zod";

import { ExternalApiUnauthorizedError, ExternalApiUnavailableError } from "@/auth/api-key";
import { ExternalApiNotFoundError, externalApiErrorResponse } from "@/contracts/api/error";

describe("externalApiErrorResponse", () => {
  it("maps the auth errors to stable statuses and codes", async () => {
    const unauthorized = externalApiErrorResponse(new ExternalApiUnauthorizedError());
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });

    const unavailable = externalApiErrorResponse(new ExternalApiUnavailableError());
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("maps not-found to 404", async () => {
    const response = externalApiErrorResponse(new ExternalApiNotFoundError());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("maps a ZodError to 400 BAD_REQUEST", async () => {
    const response = externalApiErrorResponse(new z.ZodError([{ code: "custom", path: ["limit"], message: "bad" }]));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
  });

  it("maps a missing database to 503", async () => {
    const response = externalApiErrorResponse(new Error("DATABASE_NOT_CONFIGURED"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("collapses unknown errors to 500 without leaking internals", async () => {
    const response = externalApiErrorResponse(new Error("Prisma error P2002 on column secret_value"));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error.code).toBe("INTERNAL_ERROR");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("Prisma");
    expect(serialized).not.toContain("P2002");
    expect(serialized).not.toContain("secret_value");
  });

  it("applies the V1 security headers to error responses", () => {
    const response = externalApiErrorResponse(new ExternalApiUnauthorizedError());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });
});
