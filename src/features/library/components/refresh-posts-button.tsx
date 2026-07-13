"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CHANNEL = "INSTA_POST_EXPLORER_SYNC_V1";

type SyncState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; synced: number }
  | { status: "success"; synced: number }
  | { status: "error"; message: string };

export function RefreshPostsButton({ onCompleted }: { onCompleted: () => void }) {
  const [extensionReady, setExtensionReady] = useState(false);
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as { channel?: string; type?: string; requestId?: string; payload?: Record<string, unknown> };
      if (message.channel !== CHANNEL) return;
      if (message.type === "EXTENSION_READY") {
        setExtensionReady(true);
        return;
      }
      if (!requestId.current || message.requestId !== requestId.current) return;
      if (message.type === "START_RESULT" && message.payload?.ok !== true) {
        setState({ status: "error", message: "L’extension n’a pas pu démarrer la synchronisation." });
      }
      if (message.type !== "STATE" || message.payload?.ok !== true) return;
      const task = message.payload.task as { status?: string; stats?: { synced?: number }; error?: string; resumeAt?: string | null } | null;
      if (!task) return;
      const synced = task.stats?.synced ?? 0;
      if (task.status === "completed") {
        setState({ status: "success", synced });
        onCompleted();
      } else if (task.status === "failed") {
        setState({ status: "error", message: task.error ?? "La synchronisation a échoué." });
      } else if (task.status === "paused" && !task.resumeAt) {
        setState({ status: "error", message: "Synchronisation en pause. Vérifiez votre session Instagram puis relancez." });
      } else {
        setState({ status: "running", synced });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCompleted]);

  const start = async () => {
    setState({ status: "starting" });
    try {
      const response = await fetch("/api/sync/session", { method: "POST" });
      if (!response.ok) throw new Error("SESSION_FAILED");
      const payload = await response.json() as Record<string, unknown>;
      requestId.current = crypto.randomUUID();
      window.postMessage({ channel: CHANNEL, type: "START", requestId: requestId.current, payload }, window.location.origin);
      window.setTimeout(() => {
        setState((current) => current.status === "starting"
          ? { status: "error", message: "Extension introuvable. Installez ou rechargez Insta Saved Sync." }
          : current);
      }, 5_000);
    } catch {
      setState({ status: "error", message: "Impossible de créer la session de synchronisation." });
    }
  };

  const busy = state.status === "starting" || state.status === "running";
  const label = state.status === "running"
    ? `${state.synced} nouveau${state.synced > 1 ? "x" : ""}`
    : state.status === "success"
      ? `${state.synced} synchronisé${state.synced > 1 ? "s" : ""}`
      : "Actualiser les posts";

  return (
    <div className="sync-action">
      <button className="button sync-button" type="button" disabled={busy} onClick={() => void start()} title={extensionReady ? undefined : "Nécessite l’extension Insta Saved Sync"}>
        {state.status === "success"
          ? <CheckCircle2 aria-hidden="true" className="size-4" />
          : <RefreshCw aria-hidden="true" className={busy ? "size-4 sync-spin" : "size-4"} />}
        <span className="desktop-only">{label}</span>
      </button>
      {state.status === "error" ? <span className="sync-error" role="alert">{state.message}</span> : null}
    </div>
  );
}
