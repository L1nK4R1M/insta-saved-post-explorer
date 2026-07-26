import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type {
  PersistedVerifiedMedia,
  VerifiedMediaReference,
  VerifiedMediaRepository,
} from "../db/media.js";
import { RetryableWorkerError, TerminalWorkerError } from "../runtime/dispatcher.js";

export type { PersistedVerifiedMedia, VerifiedMediaReference, VerifiedMediaRepository } from "../db/media.js";

export interface JobMediaClient {
  listVerified(): Promise<VerifiedMediaReference[]>;
  downloadToWorkdir(mediaId: string, workdir: string, signal: AbortSignal): Promise<string>;
}

export type JobMediaClientScope = {
  client: JobMediaClient;
  close(): Promise<void>;
};

type GetObjectOutput = { Body?: unknown; ContentLength?: number };
type GetObjectSender = {
  send(command: GetObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<GetObjectOutput>;
  destroy?: () => void;
};

export function createReadOnlyMediaClient(options: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
  maxBytes: number;
  mediaRepository: VerifiedMediaRepository;
  s3?: GetObjectSender;
}): JobMediaClientScope {
  const prefix = options.keyPrefix.replace(/^\/+|\/+$/g, "");
  const ownedClient = options.s3
    ? null
    : new S3Client({
        region: "auto",
        endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      });
  const sender: GetObjectSender = options.s3 ?? {
    send: (command) => ownedClient!.send(command),
    destroy: () => ownedClient!.destroy(),
  };

  const client: JobMediaClient = {
    async listVerified() {
      try {
        return await options.mediaRepository.listVerified();
      } catch {
        throw new RetryableWorkerError("WORKER_DB_UNAVAILABLE", "WORKER_DB_UNAVAILABLE");
      }
    },

    async downloadToWorkdir(mediaId, workdir, signal) {
      let media: PersistedVerifiedMedia | null;
      try {
        media = await options.mediaRepository.findVerified(mediaId);
      } catch {
        throw new RetryableWorkerError("WORKER_DB_UNAVAILABLE", "WORKER_DB_UNAVAILABLE");
      }
      if (!media) throw new TerminalWorkerError("WORKER_R2_NOT_AUTHORIZED", "WORKER_R2_NOT_AUTHORIZED");
      validateMedia(media, prefix, options.maxBytes);
      const resolvedWorkdir = path.resolve(workdir);
      const output = path.resolve(resolvedWorkdir, `media-${randomUUID()}`);
      if (path.dirname(output) !== resolvedWorkdir) throw new TerminalWorkerError("WORKER_WORKDIR_UNSAFE", "WORKER_WORKDIR_UNSAFE");

      try {
        const response = await sender.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: media.objectKey }),
          { abortSignal: signal },
        );
        if (typeof response.ContentLength === "number" && response.ContentLength > options.maxBytes) {
          throw new TerminalWorkerError("WORKER_R2_TOO_LARGE", "WORKER_R2_TOO_LARGE");
        }
        const source = toReadable(response.Body);
        let bytes = 0;
        const counter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > options.maxBytes) {
              callback(new TerminalWorkerError("WORKER_R2_TOO_LARGE", "WORKER_R2_TOO_LARGE"));
              return;
            }
            callback(null, chunk);
          },
        });
        await pipeline(source, counter, createWriteStream(output, { flags: "wx", mode: 0o600 }), { signal });
        return output;
      } catch (error) {
        await rm(output, { force: true });
        if (error instanceof TerminalWorkerError || error instanceof RetryableWorkerError) throw error;
        throw new RetryableWorkerError("WORKER_R2_UNAVAILABLE", "WORKER_R2_UNAVAILABLE");
      }
    },
  };

  return {
    client,
    async close() {
      sender.destroy?.();
    },
  };
}

function validateMedia(media: PersistedVerifiedMedia, prefix: string, maxBytes: number): void {
  const segments = media.objectKey.split("/");
  const authorized =
    media.objectKey.startsWith(`${prefix}/`) &&
    !media.objectKey.includes("\\") &&
    !segments.includes("..") &&
    (media.byteSize === null || media.byteSize >= 0);
  if (!authorized) throw new TerminalWorkerError("WORKER_R2_NOT_AUTHORIZED", "WORKER_R2_NOT_AUTHORIZED");
  if (media.byteSize !== null && media.byteSize > maxBytes) {
    throw new TerminalWorkerError("WORKER_R2_TOO_LARGE", "WORKER_R2_TOO_LARGE");
  }
}

function toReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new RetryableWorkerError("WORKER_R2_UNAVAILABLE", "WORKER_R2_UNAVAILABLE");
}
