"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, FileJson, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

type ImportState =
  | { status: "idle" }
  | { status: "ready"; file: File; entries: unknown[] }
  | { status: "importing"; file: File; entries: unknown[]; completedBatches: number; totalBatches: number }
  | { status: "success"; summary: string }
  | { status: "error"; message: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_BYTES = 850_000;
const MAX_BATCH_ITEMS = 100;

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      setState({ status: "error", message: "Sélectionnez un fichier au format .json." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setState({ status: "error", message: "Ce fichier dépasse la limite de 20 Mo. Fractionnez-le avant l’import." });
      return;
    }

    try {
      const entries = await parseFileInWorker(file);
      setState({ status: "ready", file, entries });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Le fichier JSON est invalide.",
      });
    }
  };

  const submit = async () => {
    if (state.status !== "ready") return;
    const snapshot = state;

    try {
      const batches = createImportBatches(snapshot.entries);
      setState({ ...snapshot, status: "importing", completedBatches: 0, totalBatches: batches.length });
      const importId = crypto.randomUUID();
      let imported = 0;
      let updated = 0;
      let invalid = 0;

      for (const [index, batch] of batches.entries()) {
        const response = await fetch(`/api/import?sourceName=${encodeURIComponent(snapshot.file.name)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `${importId}:${index}`,
          },
          body: JSON.stringify(batch),
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(importErrorMessage(payload.error));

        imported += Number(payload.imported ?? 0);
        updated += Number(payload.updated ?? 0);
        invalid += Number(payload.invalid ?? 0) + Number(payload.skipped ?? 0);
        setState({
          ...snapshot,
          status: "importing",
          completedBatches: index + 1,
          totalBatches: batches.length,
        });
      }

      setState({
        status: "success",
        summary: `${imported} importées, ${updated} mises à jour, ${invalid} ignorées.`,
      });
      onImported();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Impossible d’importer le fichier.",
      });
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setState({ status: "idle" });
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="import-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>(".import-button")?.focus();
          }}
        >
          <header className="modal-heading">
            <div>
              <Dialog.Title className="text-balance text-lg font-semibold">
                Importer des publications
              </Dialog.Title>
              <Dialog.Description className="text-pretty text-sm text-muted">
                Ajoutez un export JSON. Les données seront validées par lots avant l’enregistrement.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fermer l’import">
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          <button
            className="drop-zone"
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void readFile(event.dataTransfer.files[0]);
            }}
          >
            <Upload aria-hidden="true" className="size-6 text-accent" />
            <span className="font-medium">Déposez votre fichier JSON ici</span>
            <span className="text-sm text-muted">ou cliquez pour le sélectionner · 20 Mo maximum</span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />

          {state.status === "ready" || state.status === "importing" ? (
            <div className="import-feedback" aria-live="polite">
              <FileJson aria-hidden="true" className="size-5" />
              <div className="min-w-0">
                <p className="truncate font-medium">{state.file.name}</p>
                <p className="text-xs text-muted">
                  {state.entries.length.toLocaleString("fr-FR")} éléments détectés
                  {state.status === "importing"
                    ? ` · lot ${state.completedBatches}/${state.totalBatches}`
                    : ""}
                </p>
              </div>
            </div>
          ) : null}
          {state.status === "error" ? (
            <div className="import-feedback import-error" role="alert">
              <AlertCircle aria-hidden="true" className="size-5" />
              <p>{state.message}</p>
            </div>
          ) : null}
          {state.status === "success" ? (
            <div className="import-feedback import-success" role="status">
              <CheckCircle2 aria-hidden="true" className="size-5" />
              <p>{state.summary}</p>
            </div>
          ) : null}

          <footer className="modal-actions">
            <Dialog.Close asChild>
              <button className="button" type="button">Annuler</button>
            </Dialog.Close>
            <button
              className="button button-primary"
              type="button"
              disabled={state.status !== "ready"}
              onClick={() => void submit()}
            >
              {state.status === "importing" ? "Import en cours…" : "Confirmer l’import"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function extractEntries(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && "items" in input) {
    const items = (input as { items?: unknown }).items;
    if (Array.isArray(items)) return items;
  }
  throw new Error("Le JSON doit contenir un tableau ou une enveloppe avec un champ items.");
}

export function createImportBatches(entries: unknown[]): unknown[][] {
  const batches: unknown[][] = [];
  let current: unknown[] = [];

  for (const entry of entries) {
    const singleEntryBytes = byteLength([entry]);
    if (singleEntryBytes > MAX_BATCH_BYTES) {
      throw new Error("Une publication dépasse la taille maximale autorisée pour un lot.");
    }

    const candidate = [...current, entry];
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_ITEMS || byteLength(candidate) > MAX_BATCH_BYTES)
    ) {
      batches.push(current);
      current = [entry];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function importErrorMessage(code: unknown): string {
  if (code === "DATABASE_NOT_CONFIGURED") {
    return "Configurez DATABASE_URL avant de lancer un import persistant.";
  }
  if (code === "PAYLOAD_TOO_LARGE") {
    return "Un lot dépasse la limite serveur. Réduisez la taille du fichier.";
  }
  if (code === "VALIDATION_FAILED") {
    return "Certaines données ne respectent pas le format attendu.";
  }
  if (code === "IMPORT_ALREADY_STARTED") {
    return "Ce lot est déjà en cours d’import.";
  }
  return "L’import a échoué côté serveur.";
}

export function parseFileInWorker(file: File): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/import-parser.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<
      { ok: true; entries: unknown[] } | { ok: false; error: string }
    >) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.entries);
      else reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Impossible d’analyser ce fichier JSON."));
    };
    worker.postMessage({ file });
  });
}
