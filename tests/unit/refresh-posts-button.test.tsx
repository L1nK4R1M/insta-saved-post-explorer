import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
