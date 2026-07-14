"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, FileJson, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";

import { createMediaRepairBatches, extractMediaRepairCandidates, type MediaRepairCandidate } from "@/lib/media-repair";
import { parseFileInWorker } from "@/features/library/components/import-dialog";

type RepairState =
  | { status: "idle" }
  | { status: "ready"; file: File; repairs: MediaRepairCandidate[] }
  | { status: "repairing"; file: File; repairs: MediaRepairCandidate[]; completed: number; total: number }
  | { status: "success"; summary: string }
  | { status: "error"; message: string };

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function MediaRepairDialog({
  open,
  onOpenChange,
  onRepaired,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRepaired: () => void;
}) {
  const [state, setState] = useState<RepairState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      setState({ status: "error", message: "Sélectionnez un fichier JSON." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setState({ status: "error", message: "Le fichier dépasse la limite de 20 Mo." });
      return;
    }
    try {
      const repairs = extractMediaRepairCandidates(await parseFileInWorker(file));
      if (repairs.length === 0) {
        setState({ status: "error", message: "Aucune source original_thumbnail_url exploitable n’a été trouvée." });
        return;
      }
      setState({ status: "ready", file, repairs });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Le fichier JSON est invalide." });
    }
  };

  const repair = async () => {
    if (state.status !== "ready") return;
    const snapshot = state;
    const batches = createMediaRepairBatches(snapshot.repairs);
    let repaired = 0;
    let skipped = 0;
    let failed = 0;
    setState({ ...snapshot, status: "repairing", completed: 0, total: batches.length });

    try {
      for (const [index, items] of batches.entries()) {
        const response = await fetch("/api/media-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const payload = await response.json() as Record<string, unknown>;
        if (!response.ok) throw new Error("La réparation a été refusée par le serveur.");
        repaired += Number(payload.repaired ?? 0);
        skipped += Number(payload.skipped ?? 0);
        failed += Number(payload.failed ?? 0);
        setState({ ...snapshot, status: "repairing", completed: index + 1, total: batches.length });
      }
      setState({
        status: "success",
        summary: `${repaired} miniature${repaired > 1 ? "s" : ""} réparée${repaired > 1 ? "s" : ""}, ${skipped} ignorée${skipped > 1 ? "s" : ""}, ${failed} en échec.`,
      });
      onRepaired();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "La réparation a échoué." });
    }
  };

  const busy = state.status === "repairing";

  return (
    <Dialog.Root open={open} onOpenChange={(value) => {
      if (!busy) {
        onOpenChange(value);
        if (!value) setState({ status: "idle" });
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="import-dialog">
          <header className="modal-heading">
            <div>
              <Dialog.Title className="text-balance text-lg font-semibold">Réparer les médias</Dialog.Title>
              <Dialog.Description className="text-pretty text-sm text-muted">
                Analyse un export enrichi, récupère les sources manquantes et remet R2 et la base de données en accord.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fermer la réparation" disabled={busy}>
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          <button className="drop-zone" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden="true" className="size-6 text-accent" />
            <span className="font-medium">Sélectionnez le JSON source</span>
            <span className="text-sm text-muted">Les opérations sont idempotentes et traitées par petits lots.</span>
          </button>
          <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void readFile(event.target.files?.[0])} />

          {state.status === "ready" || state.status === "repairing" ? (
            <div className="import-feedback" aria-live="polite">
              <FileJson aria-hidden="true" className="size-5" />
              <div className="min-w-0">
                <p className="truncate font-medium">{state.file.name}</p>
                <p className="text-xs text-muted">
                  {state.repairs.length.toLocaleString("fr-FR")} sources détectées
                  {state.status === "repairing" ? ` · lot ${state.completed}/${state.total}` : ""}
                </p>
              </div>
            </div>
          ) : null}
          {state.status === "error" ? <div className="import-feedback import-error" role="alert"><AlertCircle aria-hidden="true" className="size-5" /><p>{state.message}</p></div> : null}
          {state.status === "success" ? <div className="import-feedback import-success" role="status"><CheckCircle2 aria-hidden="true" className="size-5" /><p>{state.summary}</p></div> : null}

          <footer className="modal-actions">
            <Dialog.Close asChild><button className="button" type="button" disabled={busy}>Fermer</button></Dialog.Close>
            <button className="button button-primary" type="button" disabled={state.status !== "ready"} onClick={() => void repair()}>
              {busy ? "Réparation en cours…" : "Lancer la réparation"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
