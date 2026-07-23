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

export function encodePlacesCursor(cursor: PlacesCursor): string {
  const payload = JSON.stringify({ updatedAt: cursor.updatedAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodePlacesCursor(token: string): PlacesCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
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
