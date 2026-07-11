"use client";

import { Heart, Images, Play } from "lucide-react";
import { useState } from "react";

import { BrokenImage } from "@/features/library/components/library-states";
import type { LibraryPost, ViewMode } from "@/features/library/types";
import { cn } from "@/lib/utils";

export function PostCard({ post, view, onOpen, isAdmin, onToggleFavorite }: { post: LibraryPost; view: ViewMode; onOpen: () => void; isAdmin: boolean; onToggleFavorite: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = post.thumbnailUrl || post.mediaUrl || "";
  const TypeIcon = post.contentType === "reel" ? Play : post.contentType === "carousel" ? Images : null;
  const favorite = post.tags.includes("Favoris");
  const visibleTags = isAdmin ? post.tags : post.tags.filter((tag) => tag !== "Favoris");

  return (
    <article className={cn("post-card", view === "masonry" && "post-card-masonry", view === "masonry" && `masonry-size-${postCardSize(post.id)}`)}>
      <button
        className="post-card-button"
        type="button"
        data-post-id={post.id}
        onClick={onOpen}
        aria-label={`Ouvrir la publication de ${post.authorUsername}`}
      >
        <div className="post-media">
          {imageFailed || !imageUrl ? (
            <BrokenImage />
          ) : (
            // Media URLs are validated as public HTTPS URLs during import. We avoid
            // forwarding the application URL to third-party image hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Média de la publication de ${post.authorUsername}`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              width={600}
              height={view === "masonry" ? masonryHeight(post.id) : 600}
              onError={() => setImageFailed(true)}
            />
          )}
          {!isAdmin && TypeIcon ? <span className="type-indicator" aria-label={`Type : ${post.contentType}`}><TypeIcon aria-hidden="true" className="size-3.5" /></span> : null}
        </div>
        <div className="post-card-copy">
          <p className="truncate text-sm font-medium">@{post.authorUsername.replace(/^@/, "")}</p>
          {post.caption ? <p className="line-clamp-2 text-pretty text-xs text-muted">{post.caption}</p> : null}
          <div className="card-tags" aria-label="Tags">
            {visibleTags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        </div>
      </button>
      {isAdmin ? (
        <button
          className={cn("favorite-button", favorite && "is-favorite")}
          type="button"
          aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
        >
          <Heart aria-hidden="true" className="size-4" fill={favorite ? "currentColor" : "none"} />
        </button>
      ) : null}
    </article>
  );
}

function masonryHeight(id: string) {
  const code = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return [520, 620, 720, 800][code % 4];
}

export function postCardSize(id: string) {
  const code = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return code % 4;
}
