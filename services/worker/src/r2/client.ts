import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { RetryableWorkerError, TerminalWorkerError } from "../runtime/dispatcher.js";

export type AuthorizedMedia = {
  ownerId: string;
  postId: string;
  objectKey: string;
  byteSize: number;
  mimeType: string | null;
  identityState: "VERIFIED";
};

export interface ReadOnlyMediaClient {
  downloadToWorkdir(media: AuthorizedMedia, workdir: string, signal: AbortSignal): Promise<string>;
  close(): Promise<void>;
}

type GetObjectOutput = { Body?: unknown; ContentLength?: number };
type GetObjectSender = { send(command: GetObjectCommand): Promise<GetObjectOutput>; destroy?: () => void };

export function createReadOnlyMediaClient(options: {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
  ownerId: string;
  postId: string;
  maxBytes: number;
  s3?: GetObjectSender;
}): ReadOnlyMediaClient {
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

  return {
    async downloadToWorkdir(media, workdir, signal) {
      validateMedia(media, options.ownerId, options.postId, prefix, options.maxBytes);
      const resolvedWorkdir = path.resolve(workdir);
      const output = path.resolve(resolvedWorkdir, "media-input");
      if (path.dirname(output) !== resolvedWorkdir) throw new TerminalWorkerError("WORKER_WORKDIR_UNSAFE", "WORKER_WORKDIR_UNSAFE");

      try {
        const response = await sender.send(new GetObjectCommand({ Bucket: options.bucket, Key: media.objectKey }));
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

    async close() {
      sender.destroy?.();
    },
  };
}

function validateMedia(media: AuthorizedMedia, ownerId: string, postId: string, prefix: string, maxBytes: number): void {
  const segments = media.objectKey.split("/");
  const authorized =
    media.ownerId === ownerId &&
    media.postId === postId &&
    media.identityState === "VERIFIED" &&
    media.objectKey.startsWith(`${prefix}/`) &&
    !media.objectKey.includes("\\") &&
    !segments.includes("..") &&
    media.byteSize >= 0;
  if (!authorized) throw new TerminalWorkerError("WORKER_R2_NOT_AUTHORIZED", "WORKER_R2_NOT_AUTHORIZED");
  if (media.byteSize > maxBytes) throw new TerminalWorkerError("WORKER_R2_TOO_LARGE", "WORKER_R2_TOO_LARGE");
}

function toReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new RetryableWorkerError("WORKER_R2_UNAVAILABLE", "WORKER_R2_UNAVAILABLE");
}
