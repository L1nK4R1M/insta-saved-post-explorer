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
  const sections = stats ? [
    { title: "Bibliothèque", description: "Volume total enregistré.", items: [{ label: "Publications", value: stats.posts, icon: BarChart3 }, { label: "Médias", value: stats.media, icon: Images }, { label: "Auteurs", value: stats.authors, icon: BarChart3 }, { label: "Favoris", value: stats.favorites, icon: Tags }] },
    { title: "Types de publications", description: "Répartition des publications disponibles.", items: [{ label: "Photos", value: stats.photos, icon: Images }, { label: "Carrousels", value: stats.carousels, icon: Images }, { label: "Vidéos", value: stats.videos, icon: Video }, { label: "Autres", value: stats.otherPosts, icon: BarChart3 }] },
    { title: "Médias et classement", description: "Fichiers indexés et métadonnées de classement.", items: [{ label: "Images", value: stats.imageMedia, icon: Images }, { label: "Fichiers vidéo", value: stats.videoMedia, icon: Video }, { label: "Tags", value: stats.tags, icon: Tags }, { label: "Thèmes", value: stats.mainThemes, icon: Tags }] },
    { title: "Engagement", description: "Totaux et moyennes des publications renseignées.", items: [{ label: "Likes", value: stats.totalLikes, icon: BarChart3 }, { label: "Commentaires", value: stats.totalComments, icon: BarChart3 }, { label: "Likes / post", value: stats.averages.likesPerRatedPost, icon: BarChart3 }, { label: "Médias / post", value: stats.averages.mediaPerPost, icon: Images }] },
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
          {stats ? <div className="stats-sections">{sections.map((section, index) => <section key={section.title} aria-labelledby={`stats-section-${index}`}>
            <div className="stats-section-heading"><div><h3 id={`stats-section-${index}`} className="text-balance">{section.title}</h3><p className="text-pretty">{section.description}</p></div><span className="tabular-nums">{section.items.length}</span></div>
            <dl className="stats-grid">{section.items.map(({ label, value, icon: Icon }) => <div key={label}><dt><Icon aria-hidden="true" className="size-4" />{label}</dt><dd className="tabular-nums">{formatter.format(value)}</dd></div>)}</dl>
          </section>)}
            <section aria-labelledby="stats-rankings"><div className="stats-section-heading"><div><h3 id="stats-rankings">Tendances</h3><p>Les contenus les plus représentés dans la bibliothèque.</p></div></div>
              <div className="stats-rankings"><StatsRanking title="Thèmes principaux" rows={stats.distributions.themes.slice(0, 6).map((item) => ({ label: item.name, value: item.count }))} formatter={formatter} /><StatsRanking title="Auteurs principaux" rows={stats.distributions.topAuthors.slice(0, 6).map((item) => ({ label: `@${item.username}`, value: item.postCount }))} formatter={formatter} /><StatsRanking title="Publications par année" rows={stats.distributions.years.slice(0, 6).map((item) => ({ label: String(item.year), value: item.count }))} formatter={formatter} /></div>
            </section>
          </div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StatsRanking({ title, rows, formatter }: { title: string; rows: Array<{ label: string; value: number }>; formatter: Intl.NumberFormat }) {
  return <div className="stats-ranking"><h4>{title}</h4><ol>{rows.map((row) => <li key={row.label}><span className="truncate">{row.label}</span><strong className="tabular-nums">{formatter.format(row.value)}</strong></li>)}</ol></div>;
}
