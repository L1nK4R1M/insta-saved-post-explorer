"use client";

import { FormEvent, useState } from "react";
import type { LibraryCollection } from "@/features/library/types";

export function CollectionManager({ initialCollections }: { initialCollections: LibraryCollection[] }) {
  const [collections, setCollections] = useState(initialCollections);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault(); setError(null);
    const response = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) return setError("Création impossible.");
    const collection = await response.json() as LibraryCollection;
    setCollections((current) => [...current, { ...collection, count: 0 }]); setName("");
  }

  async function rename(collection: LibraryCollection) {
    const nextName = window.prompt("Nouveau nom", collection.name)?.trim(); if (!nextName || nextName === collection.name) return;
    const response = await fetch(`/api/collections/${encodeURIComponent(collection.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName }) });
    if (!response.ok) return setError("Renommage impossible.");
    const updated = await response.json() as LibraryCollection;
    setCollections((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  }

  async function remove(collection: LibraryCollection) {
    if (!window.confirm(`Supprimer la collection « ${collection.name} » ?`)) return;
    const response = await fetch(`/api/collections/${encodeURIComponent(collection.id)}`, { method: "DELETE" });
    if (!response.ok) return setError("Suppression impossible.");
    setCollections((current) => current.filter((item) => item.id !== collection.id));
  }

  return <details className="collection-manager"><summary>Gérer les collections</summary>
    <form onSubmit={(event) => void create(event)}><input aria-label="Nom de la collection" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /><button className="button" type="submit">Ajouter</button></form>
    {error ? <p role="alert" className="request-error">{error}</p> : null}
    <ul>{collections.map((collection) => <li key={collection.id}><span>{collection.name} ({collection.count})</span>{collection.isSystem ? <small>Système</small> : <span><button type="button" onClick={() => void rename(collection)}>Renommer</button><button type="button" onClick={() => void remove(collection)}>Supprimer</button></span>}</li>)}</ul>
  </details>;
}
