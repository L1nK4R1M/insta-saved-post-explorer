import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RefreshPostsButton } from "@/features/library/components/refresh-posts-button";

const CHANNEL = "INSTA_POST_EXPLORER_SYNC_V2";

function dispatchExtensionMessage(data: Record<string, unknown>) {
  const event = new MessageEvent("message", {
    data,
    origin: window.location.origin,
  });
  Object.defineProperty(event, "source", { value: window });
  window.dispatchEvent(event);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RefreshPostsButton", () => {
  it("settles from the server job when the terminal extension message is lost", async () => {
    const onCompleted = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jobId: "job-1",
        token: "test-token",
        apiBaseUrl: window.location.origin,
        knownExternalIds: [],
        knownPostCodes: [],
      }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "job-1",
        status: "COMPLETED",
        collected: 2,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    render(<RefreshPostsButton onCompleted={onCompleted} />);
    dispatchExtensionMessage({
      channel: CHANNEL,
      type: "EXTENSION_READY",
      payload: { extensionId: "extension-1", version: "4.2.4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Actualiser les posts" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/sync/jobs/job-1", expect.objectContaining({
        cache: "no-store",
      }));
    });
    expect(await screen.findByText("2 synchronisés")).toBeVisible();

    dispatchExtensionMessage({
      channel: CHANNEL,
      type: "STATE",
      requestId: "00000000-0000-4000-8000-000000000001",
      payload: {
        extensionId: "extension-1",
        ok: true,
        task: { status: "completed", stats: { synced: 2 } },
      },
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("times out repeated running snapshots that make no task progress", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jobId: "job-stalled",
        token: "test-token",
        apiBaseUrl: window.location.origin,
        knownExternalIds: [],
        knownPostCodes: [],
      }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValue(new Response(JSON.stringify({
        id: "job-stalled",
        status: "RUNNING",
        heartbeatAt: "2026-07-28T12:00:00.000Z",
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000002");

    render(<RefreshPostsButton onCompleted={vi.fn()} />);
    dispatchExtensionMessage({
      channel: CHANNEL,
      type: "EXTENSION_READY",
      payload: { extensionId: "extension-1", version: "4.2.6" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Actualiser les posts" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const runningSnapshot = (progressVersion: number) => ({
      channel: CHANNEL,
      type: "STATE",
      requestId: "00000000-0000-4000-8000-000000000002",
      payload: {
        extensionId: "extension-1",
        ok: true,
        task: {
          status: "running",
          processedCount: 0,
          progressVersion,
          stats: { synced: 0 },
        },
      },
    });
    dispatchExtensionMessage({
      channel: CHANNEL,
      type: "START_RESULT",
      requestId: "00000000-0000-4000-8000-000000000002",
      payload: { extensionId: "extension-1", ok: true },
    });
    dispatchExtensionMessage(runningSnapshot(0));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      dispatchExtensionMessage(runningSnapshot(1));
      await vi.advanceTimersByTimeAsync(30_000);
      dispatchExtensionMessage(runningSnapshot(1));
      await vi.advanceTimersByTimeAsync(30_000);
      dispatchExtensionMessage(runningSnapshot(1));
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La synchronisation ne répond plus. Rechargez la page puis réessayez.",
    );
  });
});
