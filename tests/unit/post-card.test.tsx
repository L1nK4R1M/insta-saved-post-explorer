import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostCard } from "@/features/library/components/post-card";
import type { LibraryPost } from "@/features/library/types";

const videoPost: LibraryPost = {
  id: "carousel-video",
  externalId: null,
  postUrl: "https://www.instagram.com/p/C-5muknob6x",
  thumbnailUrl: "https://cdn.example.com/missing-poster.jpg",
  mediaUrl: "https://cdn.example.com/C-5muknob6x_1.mp4",
  media: [{
    id: "video-1",
    type: "video",
    url: "https://cdn.example.com/C-5muknob6x_1.mp4",
    sourcePath: "proteinrecipesdaily/C-5muknob6x_1.mp4",
    thumbnailUrl: null,
    position: 0,
  }],
  authorUsername: "proteinrecipesdaily",
  caption: "Deux recettes",
  tags: [],
  savedAt: null,
  publishedAt: "2024-08-20T17:27:01.000Z",
  contentType: "carousel",
  mainTheme: "Salé",
  likesCount: 2617,
  commentsCount: null,
  metadata: {},
  collections: ["favoris"],
};

describe("PostCard video preview", () => {
  it("ne charge la vidéo qu'au survol de la carte", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(<PostCard post={videoPost} view="grid" onOpen={vi.fn()} isAdmin={false} onToggleFavorite={vi.fn()} />);

    const card = screen.getByRole("button", { name: /ouvrir la publication/i });
    expect(card.querySelector("video")).toBeNull();

    fireEvent.mouseEnter(card);
    const video = card.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "https://cdn.example.com/C-5muknob6x_1.mp4");
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).toHaveAttribute("loop");

    fireEvent.mouseLeave(card);
    expect(card.querySelector("video")).toBeNull();
  });
});
