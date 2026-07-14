import { describe, expect, it } from "vitest";

import { createMediaRepairBatches, extractMediaRepairCandidates } from "@/lib/media-repair";

describe("media repair manifest", () => {
  it("extracts and deduplicates original video thumbnails", () => {
    const repairs = extractMediaRepairCandidates([{
      post_url: "https://www.instagram.com/p/example/",
      content_type: "carousel",
      media: [
        { type: "video", position: 0, original_thumbnail_url: "https://cdn.example/one.jpg" },
        { type: "video", position: 1, original_thumbnail_url: "https://cdn.example/two.jpg" },
        { type: "video", position: 1, original_thumbnail_url: "https://cdn.example/two-new.jpg" },
        { type: "video", position: 2, original_url: "https://cdn.example/video.mp4" },
        { type: "image", position: 3, original_thumbnail_url: "https://cdn.example/photo.jpg" },
      ],
    }]);

    expect(repairs).toEqual([
      { postUrl: "https://www.instagram.com/p/example/", position: 0, sourceUrl: "https://cdn.example/one.jpg" },
      { postUrl: "https://www.instagram.com/p/example/", position: 1, sourceUrl: "https://cdn.example/two-new.jpg" },
    ]);
  });

  it("creates bounded repair batches", () => {
    const repairs = Array.from({ length: 12 }, (_, position) => ({
      postUrl: `https://www.instagram.com/p/example-${position}`,
      position: 0,
      sourceUrl: `https://cdn.example/${position}.jpg`,
    }));
    expect(createMediaRepairBatches(repairs, 5).map((batch) => batch.length)).toEqual([5, 5, 2]);
  });
});
