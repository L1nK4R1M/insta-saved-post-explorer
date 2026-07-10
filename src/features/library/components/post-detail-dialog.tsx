"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DeletePostAlert } from "@/features/library/components/admin/delete-post-alert";
import { PostTagEditor } from "@/features/library/components/admin/post-tag-editor";
import { BrokenImage } from "@/features/library/components/library-states";
import type { LibraryPost } from "@/features/library/types";

type PostDetailDialogProps = {
  post: LibraryPost | null;
  position: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function PostDetailDialog({ post, position, total, onClose, onPrevious, onNext }: PostDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const [detailPost, setDetailPost] = useState<LibraryPost | null>(null);

  useEffect(() => {
    if (!post) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.defaultPrevented || target?.closest("input, textarea, select, [contenteditable='true'], [role='alertdialog']")) return;
      if (event.key === "ArrowLeft") onPrevious();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrevious, post]);

  useEffect(() => {
    if (!post) return;
    const controller = new AbortController();
    void fetch(`/api/posts/${encodeURIComponent(post.id)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        if (value && typeof value === "object") setDetailPost(value as LibraryPost);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to load post detail");
        }
      });
    return () => controller.abort();
  }, [post]);

  if (!post) return null;
  const displayPost = detailPost?.id === post.id ? detailPost : post;
  const imageUrl = displayPost.mediaUrl || displayPost.thumbnailUrl;

  const copyLink = async () => {
    await navigator.clipboard.writeText(displayPost.postUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="detail-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = document.querySelector<HTMLButtonElement>(`[data-post-id="${CSS.escape(post.id)}"]`);
            trigger?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Publication de {displayPost.authorUsername}</Dialog.Title>
          <Dialog.Description className="sr-only">Détail de la publication, avec navigation précédente et suivante.</Dialog.Description>
          <header className="detail-header">
            <div className="detail-progress" aria-label={`Publication ${position + 1} sur ${total}`}>
              <span aria-hidden="true" />
              <span className="tabular-nums">{position + 1} / {total}</span>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fermer le détail">
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
          </header>

          <div className="detail-scroll">
            <div className="detail-media">
              <DetailImage
                key={displayPost.id}
                imageUrl={imageUrl}
                alt={`Média de la publication de ${displayPost.authorUsername}`}
              />
              <button className="media-nav media-nav-left" type="button" onClick={onPrevious} aria-label="Publication précédente">
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <button className="media-nav media-nav-right" type="button" onClick={onNext} aria-label="Publication suivante">
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </div>

            <div className="detail-author-row">
              <div className="avatar" aria-hidden="true">{displayPost.authorUsername.replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0">
                <p className="truncate font-semibold">@{displayPost.authorUsername.replace(/^@/, "")}</p>
                <p className="text-xs text-muted">{formatSavedAt(displayPost.savedAt)}</p>
              </div>
              <a className="button ml-auto" href={displayPost.postUrl} target="_blank" rel="noreferrer">
                Ouvrir sur Instagram
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </div>

            <p className="detail-caption text-pretty">{displayPost.caption || "Aucune légende disponible."}</p>

            <section className="detail-section" aria-labelledby="detail-tags">
              <h2 id="detail-tags" className="field-label">Tags</h2>
              <PostTagEditor
                postId={displayPost.id}
                tags={displayPost.tags}
                onTagsChange={(tags) => setDetailPost({ ...displayPost, tags })}
              />
            </section>

            <dl className="metadata-grid">
              <div><dt>Type</dt><dd>{contentTypeLabel(displayPost.contentType)}</dd></div>
              <div><dt>Publié</dt><dd>{formatDate(displayPost.publishedAt)}</dd></div>
              <div><dt>Thème</dt><dd>{displayPost.mainTheme || "Non défini"}</dd></div>
              <div><dt>Identifiant</dt><dd className="truncate">{displayPost.externalId || displayPost.id}</dd></div>
            </dl>
          </div>

          <footer className="detail-footer">
            <div className="detail-navigation">
              <button className="button" type="button" onClick={onPrevious}>
                <ArrowLeft aria-hidden="true" className="size-4" /> Précédent
              </button>
              <span className="content-type-pill">{contentTypeLabel(displayPost.contentType)}</span>
              <button className="button button-primary" type="button" onClick={onNext}>
                Suivant <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            </div>
            <button className="button w-full" type="button" onClick={copyLink}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copied ? "Lien copié" : "Copier le lien"}
            </button>
            <DeletePostAlert
              postId={displayPost.id}
              authorUsername={displayPost.authorUsername}
              onDeleted={() => {
                onClose();
                window.location.reload();
              }}
            />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailImage({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !imageUrl) return <BrokenImage />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function formatSavedAt(value: string | null) {
  return value ? `Enregistré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(value))}` : "Date d’enregistrement inconnue";
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "Inconnue";
}

function contentTypeLabel(value: LibraryPost["contentType"]) {
  return ({ image: "Image", carousel: "Carousel", reel: "Reel", other: "Autre" } as const)[value];
}
