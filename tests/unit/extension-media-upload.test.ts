import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "extension/ig-saved-sync/background.js"),
  "utf8",
);

describe("extension R2 media upload", () => {
  it("buffers the Instagram response as a Blob before uploading", () => {
    expect(backgroundSource).toContain("source.blob()");
    expect(backgroundSource).toContain("body: mediaBlob");
    expect(backgroundSource).toContain("const byteSize = mediaBlob.size");
  });

  it("does not use browser request streaming for the R2 PUT", () => {
    expect(backgroundSource).not.toContain('duplex: "half"');
  });

  it("reports the failing synchronization stage", () => {
    expect(backgroundSource).toContain('networkStageError("media_fetch"');
    expect(backgroundSource).toContain('networkStageError("media_buffer"');
    expect(backgroundSource).toContain('networkStageError("media_prepare"');
    expect(backgroundSource).toContain('networkStageError("media_upload"');
  });
});
