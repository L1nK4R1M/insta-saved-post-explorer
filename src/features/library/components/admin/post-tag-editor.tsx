"use client";

import { Tag, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";

type TagSuggestion = { name: string; slug: string; count: number };

type PostTagEditorProps = {
  postId: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
};

export function PostTagEditor({ postId, tags, onTagsChange }: PostTagEditorProps) {
  const inputId = useId();
  const suggestionsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "error" | "status"; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/tags", { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ items?: TagSuggestion[] }> : null)
      .then((payload) => setSuggestions(Array.isArray(payload?.items) ? payload.items : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      });
    return () => controller.abort();
  }, [postId]);

  const availableSuggestions = useMemo(() => {
    const selected = new Set(tags.map(normalize));
    const query = normalize(value);
    return suggestions
      .filter((suggestion) => !selected.has(normalize(suggestion.name)))
      .filter((suggestion) => !query || normalize(suggestion.name).includes(query))
      .slice(0, 8);
  }, [suggestions, tags, value]);

  const addTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tag = value.trim().replace(/\s+/g, " ");
    if (!tag || pendingTag) return;
    setPendingTag(tag);
    setFeedback(null);

    try {
      const nextTags = await mutatePostTag(postId, tag, "POST");
      onTagsChange(nextTags);
      setValue("");
      setFeedback({ kind: "status", message: `Tag ${tag} ajouté.` });
    } catch {
      setFeedback({ kind: "error", message: "Impossible d’ajouter ce tag." });
    } finally {
      setPendingTag(null);
      inputRef.current?.focus();
    }
  };

  const removeTag = async (tag: string) => {
    if (pendingTag) return;
    setPendingTag(tag);
    setFeedback(null);
    try {
      const nextTags = await mutatePostTag(postId, tag, "DELETE");
      onTagsChange(nextTags);
      setFeedback({ kind: "status", message: `Tag ${tag} supprimé.` });
    } catch {
      setFeedback({ kind: "error", message: "Impossible de supprimer ce tag." });
    } finally {
      setPendingTag(null);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="mt-2 grid gap-3">
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Tags associés à cette publication">
          {tags.map((tag) => (
            <li key={tag} className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-subtle)] pl-2 text-xs">
              <span>#{tag}</span>
              <button
                className="text-button"
                type="button"
                aria-label={`Supprimer le tag ${tag}`}
                disabled={pendingTag !== null}
                onClick={() => void removeTag(tag)}
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Aucun tag</p>}

      <form className="grid gap-2" onSubmit={(event) => void addTag(event)}>
        <label className="field-label" htmlFor={inputId}>Ajouter un tag</label>
        <div className="flex gap-2">
          <div className="input-shell min-w-0 flex-1">
            <Tag aria-hidden="true" className="size-4" />
            <input
              ref={inputRef}
              id={inputId}
              list={suggestionsId}
              value={value}
              maxLength={80}
              autoComplete="off"
              placeholder="Ex. inspiration"
              disabled={pendingTag !== null}
              onChange={(event) => setValue(event.target.value)}
            />
            <datalist id={suggestionsId}>
              {availableSuggestions.map((suggestion) => (
                <option key={suggestion.slug} value={suggestion.name}>{suggestion.count} publications</option>
              ))}
            </datalist>
          </div>
          <button className="button" type="submit" disabled={!value.trim() || pendingTag !== null}>
            {pendingTag === value.trim() ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>

      {feedback ? (
        <p className={feedback.kind === "error" ? "request-error" : "text-sm text-muted"} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

async function mutatePostTag(postId: string, tag: string, method: "POST" | "DELETE"): Promise<string[]> {
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/tags`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag }),
  });
  if (!response.ok) throw new Error("TAG_MUTATION_FAILED");
  const payload = await response.json() as { tags?: unknown };
  if (!Array.isArray(payload.tags) || !payload.tags.every((item) => typeof item === "string")) {
    throw new Error("INVALID_TAG_RESPONSE");
  }
  return payload.tags;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}
