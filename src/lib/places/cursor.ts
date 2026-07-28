import { z } from "zod";

// Opaque cursor for Places list endpoints. It encodes only the ordering key
// (`updatedAt`, `id`) as base64url JSON. It is Zod-validated on decode and must
// be owner-scoped by the caller. A malformed cursor throws so routes can map it
// to BAD_REQUEST.

export type PlacesCursor = {
  updatedAt: Date;
  id: string;
};

const cursorSchema = z
  .object({
    updatedAt: z.string().datetime(),
    id: z.string().min(1).max(256),
  })
  .strict();

// Bound the token well above a normal cursor (an ISO timestamp plus a bounded
// id, base64url encoded) but low enough to reject unreasonable allocation.
const MAX_CURSOR_LENGTH = 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function encodePlacesCursor(cursor: PlacesCursor): string {
  const payload = JSON.stringify({ updatedAt: cursor.updatedAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePlacesCursor(token: string): PlacesCursor {
  // Node's base64url decoder is permissive: it silently ignores invalid
  // characters, padding, and whitespace, so a valid cursor with garbage
  // appended would otherwise be accepted. Validate a bounded, strictly
  // base64url token and require a canonical round-trip before decoding.
  if (token.length === 0 || token.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(token)) {
    throw new PlacesCursorError();
  }
  const decoded = Buffer.from(token, "base64url");
  if (decoded.toString("base64url") !== token) {
    throw new PlacesCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new PlacesCursorError();
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) throw new PlacesCursorError();
  return { updatedAt: new Date(result.data.updatedAt), id: result.data.id };
}

export class PlacesCursorError extends Error {
  constructor() {
    super("INVALID_CURSOR");
    this.name = "PlacesCursorError";
  }
}
