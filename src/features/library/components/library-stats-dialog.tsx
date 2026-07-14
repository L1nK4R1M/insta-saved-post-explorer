"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, Images, Tags, Video, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { LibraryStats } from "@/features/library/types";

export function LibraryStatsDialog() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || stats) return;
    const controller = new AbortController();
    void fetch("/api/stats", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("STATS_UNAVAILABLE");
        return response.json() as Promise<LibraryStats>;
      })
      .then(setStats)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, [open, stats]);

  const formatter = new Intl.NumberFormat("fr-FR");
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && error) setError(false);
    setOpen(nextOpen);
  };
  const items = stats ? [
    { label: "Publications", value: stats.posts, icon: BarChart3 },
    { label: "Photos", value: stats.photos, icon: Images },
    { label: "Carrousels", value: stats.carousels, icon: Images },
    { label: "Vidéos", value: stats.videos, icon: Video },
    { label: "Autres", value: stats.otherPosts, icon: BarChart3 },
    { label: "Médias", value: stats.media, icon: Images },
    { label: "Images", value: stats.imageMedia, icon: Images },
    { label: "Fichiers vidéo", value: stats.videoMedia, icon: Video },
    { label: "Tags", value: stats.tags, icon: Tags },
    { label: "Thèmes", value: stats.mainThemes, icon: Tags },
  ] : [];

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button className="icon-button" type="button" aria-label="Afficher les statistiques de la bibliothèque">
          <BarChart3 aria-hidden="true" className="size-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="stats-dialog">
          <header className="stats-header">
            <div>
              <Dialog.Title className="stats-title text-balance">Statistiques de la bibliothèque</Dialog.Title>
              <Dialog.Description className="text-sm text-muted text-pretty">Vue globale de tous les posts actuellement enregistrés.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fermer les statistiques"><X aria-hidden="true" className="size-5" /></button></Dialog.Close>
          </header>
          {!stats && !error ? <p className="stats-status" role="status"><span className="loading-spinner" aria-hidden="true" />Chargement des statistiques…</p> : null}
          {error ? <p className="stats-error" role="alert">Les statistiques sont momentanément indisponibles.</p> : null}
          {stats ? <dl className="stats-grid">{items.map(({ label, value, icon: Icon }) => (
            <div key={label}><dt><Icon aria-hidden="true" className="size-4" />{label}</dt><dd className="tabular-nums">{formatter.format(value)}</dd></div>
          ))}</dl> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
