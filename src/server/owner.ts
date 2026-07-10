import "server-only";

import { z } from "zod";

import { getConfiguredOwnerId } from "@/auth/config";

const ownerIdSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

export function getApplicationOwnerId(): string {
  return getConfiguredOwnerId();
}

export function parseOwnerId(ownerId: unknown): string {
  return ownerIdSchema.parse(ownerId);
}
