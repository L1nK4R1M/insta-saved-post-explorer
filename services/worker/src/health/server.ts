import { createServer, type Server, type ServerResponse } from "node:http";

export function createHealthServer(input: {
  host: string;
  port: number;
  isStopping: () => boolean;
  checkDatabase: (signal: AbortSignal) => Promise<void>;
  readinessTimeoutMs?: number;
}): { start(): Promise<void>; close(): Promise<void> } {
  let server: Server | null = null;
  let closePromise: Promise<void> | null = null;

  return {
    async start() {
      if (server) return;
      server = createServer(async (request, response) => {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          send(response, 405, { status: "method_not_allowed" });
          return;
        }
        if (request.url === "/health/live") {
          send(response, 200, { status: "live" });
          return;
        }
        if (request.url === "/health/ready") {
          if (input.isStopping()) {
            send(response, 503, { status: "not_ready" });
            return;
          }
          try {
            const signal = AbortSignal.timeout(input.readinessTimeoutMs ?? 2_000);
            await abortable(input.checkDatabase(signal), signal);
            send(response, 200, { status: "ready" });
          } catch {
            send(response, 503, { status: "not_ready" });
          }
          return;
        }
        send(response, 404, { status: "not_found" });
      });

      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(input.port, input.host, resolve);
      });
    },

    close() {
      if (closePromise) return closePromise;
      if (!server) return Promise.resolve();
      const closing = server;
      server = null;
      closePromise = new Promise<void>((resolve, reject) => {
        closing.close((error) => (error ? reject(error) : resolve()));
      });
      return closePromise;
    },
  };
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function send(response: ServerResponse, statusCode: number, body: { status: string }): void {
  const serialized = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(serialized));
  response.end(serialized);
}
