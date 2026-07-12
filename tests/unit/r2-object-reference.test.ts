// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateR2ObjectReference } from "@/server/r2";

describe("références d’objets R2", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepte uniquement la clé déterministe du média", () => {
    vi.stubEnv("MEDIA_PATH_PREFIX", "originals");
    expect(() => validateR2ObjectReference({
      objectKey: "originals/chef.test/CODE_2.mp4",
      sourcePath: "chef.test/CODE_2.mp4",
      authorUsername: "chef.test",
      postCode: "CODE",
      position: 1,
      carousel: true,
      kind: "video",
    })).not.toThrow();
  });

  it("refuse une clé appartenant à un autre post", () => {
    vi.stubEnv("MEDIA_PATH_PREFIX", "originals");
    expect(() => validateR2ObjectReference({
      objectKey: "originals/other/SECRET.mp4",
      sourcePath: "other/SECRET.mp4",
      authorUsername: "chef.test",
      postCode: "CODE",
      position: 0,
      carousel: false,
      kind: "video",
    })).toThrow("INVALID_R2_OBJECT_REFERENCE");
  });
});
