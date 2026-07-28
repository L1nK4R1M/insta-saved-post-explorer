import type { Pool } from "pg";

export type VerifiedMediaReference = {
  id: string;
  position: number;
  mimeType: string | null;
  byteSize: number | null;
};

export type PersistedVerifiedMedia = VerifiedMediaReference & {
  objectKey: string;
  versionTag: string | null;
};

export interface VerifiedMediaRepository {
  listVerified(): Promise<VerifiedMediaReference[]>;
  findVerified(mediaId: string): Promise<PersistedVerifiedMedia | null>;
}

type MediaReferenceRow = {
  id: string;
  position: number;
  mime_type: string | null;
  byte_size: number | null;
};

type MediaRow = MediaReferenceRow & {
  object_key: string;
  version_tag: string | null;
};

export function createVerifiedMediaRepository(
  pool: Pick<Pool, "query">,
  scope: { ownerId: string; postId: string },
): VerifiedMediaRepository {
  return {
    async listVerified() {
      const result = await pool.query<MediaReferenceRow>(
        `SELECT id, position, mime_type, byte_size
         FROM post_media
         WHERE owner_id = $1 AND post_id = $2
           AND identity_state = 'VERIFIED' AND object_key IS NOT NULL
         ORDER BY position ASC, id ASC`,
        [scope.ownerId, scope.postId],
      );
      return result.rows.map(toReference);
    },

    async findVerified(mediaId) {
      const result = await pool.query<MediaRow>(
        `SELECT id, position, mime_type, byte_size, object_key, version_tag
         FROM post_media
         WHERE id = $3 AND owner_id = $1 AND post_id = $2
           AND identity_state = 'VERIFIED' AND object_key IS NOT NULL
         LIMIT 1`,
        [scope.ownerId, scope.postId, mediaId],
      );
      const row = result.rows[0];
      return row ? toPersisted(row) : null;
    },
  };
}

function toReference(row: MediaReferenceRow): VerifiedMediaReference {
  return {
    id: row.id,
    position: row.position,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
  };
}

function toPersisted(row: MediaRow): PersistedVerifiedMedia {
  return {
    ...toReference(row),
    objectKey: row.object_key,
    versionTag: row.version_tag,
  };
}
