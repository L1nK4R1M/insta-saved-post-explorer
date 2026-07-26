import { createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createHealthServer } from "../src/health/server.js";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("worker health server", () => {
  it("serves sparse live and ready responses without internal data", async () => {
    const port = await availablePort();
    const checkDatabase = vi.fn(async () => undefined);
    const server = createHealthServer({ host: "127.0.0.1", port, isStopping: () => false, checkDatabase });
    servers.push(server);
    await server.start();

    const live = await fetch(`http://127.0.0.1:${port}/health/live`);
    const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);

    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: "live" });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: "ready" });
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it.each([
    ["database failure", () => Promise.reject(new Error("postgresql://secret"))],
    ["database timeout", () => new Promise<void>(() => undefined)],
  ])("returns bounded secret-free readiness for %s", async (_name, checkDatabase) => {
    const port = await availablePort();
    const server = createHealthServer({
      host: "127.0.0.1",
      port,
      isStopping: () => false,
      checkDatabase,
      readinessTimeoutMs: 25,
    });
    servers.push(server);
    await server.start();

    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"not_ready"}');
    expect(body).not.toContain("postgresql");
    expect(body).not.toContain("secret");
  });

  it("becomes not ready while stopping and enforces route/method boundaries", async () => {
    const port = await availablePort();
    let stopping = false;
    const server = createHealthServer({ host: "127.0.0.1", port, isStopping: () => stopping, checkDatabase: async () => undefined });
    servers.push(server);
    await server.start();

    stopping = true;
    expect((await fetch(`http://127.0.0.1:${port}/health/ready`)).status).toBe(503);
    expect((await fetch(`http://127.0.0.1:${port}/unknown`)).status).toBe(404);
    const method = await fetch(`http://127.0.0.1:${port}/health/live`, { method: "POST" });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
  });

  it("closes idempotently and refuses new connections", async () => {
    const port = await availablePort();
    const server = createHealthServer({ host: "127.0.0.1", port, isStopping: () => false, checkDatabase: async () => undefined });
    await server.start();
    await server.close();
    await server.close();

    await expect(fetch(`http://127.0.0.1:${port}/health/live`)).rejects.toThrow();
  });
});

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}
