"use client";

import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Heart, Image, Merge, Pencil, RefreshCw, Search, Tags, Trash2, Video, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/brand";
import { MediaRepairDialog } from "@/features/library/components/media-repair-dialog";

type TagItem = { id: string; name: string; slug: string; count: number };
type Variant = { tagId: string; candidateId: string; reason: string };
type Insights = { total: number; favorites: number; contentTypes: Metric[]; themes: Metric[]; authors: Metric[]; years: Metric[] };
type Metric = { name: string; count: number };
type Health = { posts: number; media: number; totalAnomalies: number; checkedAt: string; anomalies: Record<string, number> };

export function AdminCenter() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tagResponse, insightResponse, healthResponse] = await Promise.all([
        fetch("/api/admin/tags", { cache: "no-store" }), fetch("/api/admin/insights", { cache: "no-store" }), fetch("/api/admin/media-health", { cache: "no-store" }),
      ]);
      if (![tagResponse, insightResponse, healthResponse].every((response) => response.ok)) throw new Error("ADMIN_UNAVAILABLE");
      const tagPayload = await tagResponse.json() as { items: TagItem[]; variants: Variant[] };
      setTags(tagPayload.items); setVariants(tagPayload.variants); setInsights(await insightResponse.json()); setHealth(await healthResponse.json());
    } catch { setError("Le centre admin est momentanément indisponible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = async (tag: TagItem, action: "rename" | "merge" | "delete", target?: TagItem) => {
    let body: Record<string, string> | undefined;
    if (action === "rename") {
      const name = window.prompt("Nouveau nom du tag", tag.name)?.trim();
      if (!name || name === tag.name) return;
      if (!window.confirm(`Renommer « ${tag.name} » en « ${name} » ?`)) return;
      body = { action, name };
    } else if (action === "merge" && target) {
      if (!window.confirm(`Fusionner « ${tag.name} » (${tag.count}) vers « ${target.name} » (${target.count}) ? Cette opération réaffecte les publications et supprime le tag source.`)) return;
      body = { action, targetId: target.id };
    } else if (action === "delete") {
      if (!window.confirm(`Supprimer « ${tag.name} » et le désassigner de ${tag.count} publication(s) ?`)) return;
    } else return;
    setBusy(tag.id); setError(null);
    try {
      const response = await fetch(`/api/admin/tags/${encodeURIComponent(tag.id)}`, { method: action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error("MUTATION_FAILED");
      await load();
    } catch { setError("L’opération sur le tag a échoué. Vérifiez qu’il n’existe pas déjà."); }
    finally { setBusy(null); }
  };

  const displayedTags = useMemo(() => tags.filter((tag) => tag.name.toLocaleLowerCase("fr-FR").includes(query.toLocaleLowerCase("fr-FR"))), [query, tags]);
  const byId = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  return <div className="admin-shell">
    <header className="admin-header"><Link href="/" aria-label="Retour à la bibliothèque"><Brand compact /></Link><div><h1>Centre d’administration</h1><p>Tags, santé des médias et insights de la bibliothèque.</p></div><Link className="button" href="/"><ArrowLeft className="size-4" /> Bibliothèque</Link></header>
    {loading ? <div className="admin-state" role="status"><span className="loading-spinner" />Chargement du centre admin…</div> : null}
    {error ? <div className="admin-alert" role="alert"><AlertTriangle className="size-5" />{error}<button className="text-button" onClick={() => void load()}>Réessayer</button></div> : null}
    {!loading && insights && health ? <main className="admin-grid">
      <section className="admin-panel admin-overview"><div className="admin-section-title"><div><BarChart3 /><h2>Vue d’ensemble</h2></div><span>{insights.total.toLocaleString("fr-FR")} publications</span></div>
        <div className="admin-kpis"><Kpi label="Favoris" value={insights.favorites} icon={Heart} /><Kpi label="Photos" value={metric(insights.contentTypes, "image")} icon={Image} /><Kpi label="Vidéos" value={metric(insights.contentTypes, "reel")} icon={Video} /><Kpi label="Carrousels" value={metric(insights.contentTypes, "carousel")} icon={Image} /></div>
        <div className="admin-breakdowns"><Breakdown title="Thèmes" items={insights.themes} /><Breakdown title="Années" items={insights.years} /><Breakdown title="Auteurs" items={insights.authors} /></div>
      </section>
      <section className="admin-panel"><div className="admin-section-title"><div><Wrench /><h2>Santé médias</h2></div><span className={health.totalAnomalies ? "status-warning" : "status-ok"}>{health.totalAnomalies ? <AlertTriangle /> : <CheckCircle2 />}{health.totalAnomalies} anomalie(s)</span></div>
        <div className="health-grid"><Kpi label="Publications sans média" value={health.anomalies.postsWithoutMedia} icon={AlertTriangle} /><Kpi label="Miniatures post externes/vides" value={health.anomalies.missingPostThumbnail} icon={AlertTriangle} /><Kpi label="Sources média absentes" value={health.anomalies.missingMediaSource} icon={AlertTriangle} /><Kpi label="Miniatures vidéo absentes" value={health.anomalies.missingVideoThumbnail} icon={AlertTriangle} /></div>
        <p className="admin-note">Contrôle structurel base de données effectué le {new Date(health.checkedAt).toLocaleString("fr-FR")}. La vérification R2 approfondie reste réalisée pendant la réparation.</p>
        <div className="admin-actions"><button className="button" onClick={() => void load()}><RefreshCw className="size-4" /> Refaire le check</button><button className="button button-primary" onClick={() => setRepairOpen(true)}><Wrench className="size-4" /> Réparer depuis un export</button></div>
      </section>
      <section className="admin-panel admin-tags"><div className="admin-section-title"><div><Tags /><h2>Gestion des tags</h2></div><span>{tags.length} tags</span></div>
        <label className="admin-search"><Search className="size-4" /><span className="sr-only">Rechercher un tag</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un tag…" /></label>
        {variants.length ? <div className="variant-list"><strong>Variantes probables · aucune action automatique</strong>{variants.slice(0, 12).map((variant) => { const source = byId.get(variant.tagId); const target = byId.get(variant.candidateId); return source && target ? <div key={`${variant.tagId}:${variant.candidateId}`}><span>« {source.name} » / « {target.name} » · {variant.reason}</span><button disabled={Boolean(busy)} onClick={() => void mutate(source, "merge", target)}><Merge className="size-3.5" /> Fusionner vers {target.name}</button></div> : null; })}</div> : null}
        <div className="tag-admin-list">{displayedTags.map((tag) => <div key={tag.id}><span><strong>{tag.name}</strong><small>{tag.count} publication(s)</small></span><span><button aria-label={`Renommer ${tag.name}`} disabled={Boolean(busy)} onClick={() => void mutate(tag, "rename")}><Pencil /></button><button aria-label={`Supprimer ${tag.name}`} disabled={Boolean(busy)} onClick={() => void mutate(tag, "delete")}><Trash2 /></button></span></div>)}</div>
      </section>
    </main> : null}
    <MediaRepairDialog open={repairOpen} onOpenChange={setRepairOpen} onRepaired={() => void load()} />
  </div>;
}

function Kpi({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Heart }) { return <div className="admin-kpi"><Icon /><span>{label}</span><strong>{value.toLocaleString("fr-FR")}</strong></div>; }
function Breakdown({ title, items }: { title: string; items: Metric[] }) { const max = Math.max(1, ...items.map((item) => item.count)); return <div><h3>{title}</h3>{items.length ? items.map((item) => <div className="metric-row" key={item.name}><span>{item.name}</span><i><b style={{ width: `${Math.max(4, item.count / max * 100)}%` }} /></i><strong>{item.count}</strong></div>) : <p className="admin-note">Aucune donnée.</p>}</div>; }
function metric(items: Metric[], name: string) { return items.find((item) => item.name === name)?.count ?? 0; }
