import "server-only";

import { z } from "zod";
import { tagSlug } from "@/lib/import/normalize";
import { databaseConfigured, prisma } from "@/server/db";
import { parseOwnerId } from "@/server/owner";
import { AdminResourceNotFoundError } from "@/server/admin-library";

const nameSchema = z.string().trim().min(1).max(80).transform((value) => value.replace(/\s+/g, " "));
const idSchema = z.string().trim().min(1).max(256);

function requireDatabase() { if (!databaseConfigured) throw new Error("DATABASE_NOT_CONFIGURED"); }

export async function createCollection(owner: string, rawName: string) {
  requireDatabase();
  const ownerId = parseOwnerId(owner); const name = nameSchema.parse(rawName); const slug = tagSlug(name);
  return prisma.collection.create({ data: { ownerId, name, slug, isPublic: true }, select: { id: true, name: true, slug: true, isSystem: true } });
}

export async function renameCollection(owner: string, rawId: string, rawName: string) {
  requireDatabase(); const ownerId = parseOwnerId(owner); const id = idSchema.parse(rawId); const name = nameSchema.parse(rawName);
  const result = await prisma.collection.updateMany({ where: { id, ownerId, isSystem: false }, data: { name, slug: tagSlug(name) } });
  if (!result.count) throw new AdminResourceNotFoundError();
  return prisma.collection.findFirstOrThrow({ where: { id, ownerId }, select: { id: true, name: true, slug: true, isSystem: true } });
}

export async function deleteCollection(owner: string, rawId: string) {
  requireDatabase(); const ownerId = parseOwnerId(owner); const id = idSchema.parse(rawId);
  const result = await prisma.collection.deleteMany({ where: { id, ownerId, isSystem: false } });
  if (!result.count) throw new AdminResourceNotFoundError();
}

export async function setPostCollection(owner: string, rawCollectionId: string, rawPostId: string, included: boolean) {
  requireDatabase(); const ownerId = parseOwnerId(owner); const collectionId = idSchema.parse(rawCollectionId); const postId = idSchema.parse(rawPostId);
  const [collection, post] = await Promise.all([prisma.collection.findFirst({ where: { id: collectionId, ownerId } }), prisma.post.findFirst({ where: { id: postId, ownerId }, select: { id: true } })]);
  if (!collection || !post) throw new AdminResourceNotFoundError();
  if (included) await prisma.collectionPost.upsert({ where: { collectionId_postId: { collectionId, postId } }, create: { collectionId, postId }, update: {} });
  else await prisma.collectionPost.deleteMany({ where: { collectionId, postId } });
  return { included };
}
