"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CHANNEL = "INSTA_POST_EXPLORER_SYNC_V2";

function startErrorMessage(error: unknown) {
  switch (error) {
    case "export_already_running":
      return "Une synchronisation est déjà en cours dans cette extension.";
    case "another_export_is_running":
      return "Un export local est en cours dans l’extension. Terminez-le ou mettez-le en pause.";
    case "invalid_sync_origin":
      return "Cette version de l’extension n’autorise pas l’adresse actuelle du site.";
    case "invalid_sync_session":
      return "La session de synchronisation est invalide. Reconnectez-vous en administrateur.";
    default:
      return `L’extension n’a pas pu démarrer la synchronisation${typeof error === "string" ? ` (${error})` : ""}.`;
  }
}

type SyncState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; synced: number }
  | { status: "paused"; synced: number; message: string }
  | { status: "success"; synced: number }
  | { status: "error"; message: string };

type ExtensionCandidate = { extensionId: string; version: string };

function nextCandidate(candidates: Map<string, string>, attempted: Set<string>) {
  return [...candidates.entries()]
    .map(([extensionId, version]) => ({ extensionId, version }))
    .filter((candidate) => !attempted.has(candidate.extensionId))
    .sort((left, right) => {
      const versionOrder = right.version.localeCompare(left.version, undefined, { numeric: true });
      return versionOrder || left.extensionId.localeCompare(right.extensionId);
    })[0] ?? null;
}

function sendStart(candidate: ExtensionCandidate, requestId: string, payload: Record<string, unknown>) {
  window.postMessage({
    channel: CHANNEL,
    type: "START",
    targetExtensionId: candidate.extensionId,
    requestId,
    payload,
  }, window.location.origin);
}

export function RefreshPostsButton({ onCompleted }: { onCompleted: () => void }) {
  const [extensionReady, setExtensionReady] = useState(false);
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const requestId = useRef<string | null>(null);
  const candidates = useRef(new Map<string, string>());
  const attempted = useRef(new Set<string>());
  const syncPayload = useRef<Record<string, unknown> | null>(null);
  const currentTarget = useRef<string | null>(null);
  const attemptTimer = useRef<number | null>(null);
  const attemptNext = useRef<() => boolean>(() => false);

  useEffect(() => {
    attemptNext.current = () => {
      if (!requestId.current || !syncPayload.current) return false;
      const candidate = nextCandidate(candidates.current, attempted.current);
      if (!candidate) return false;
      attempted.current.add(candidate.extensionId);
      currentTarget.current = candidate.extensionId;
      sendStart(candidate, requestId.current, syncPayload.current);
      if (attemptTimer.current) window.clearTimeout(attemptTimer.current);
      attemptTimer.current = window.setTimeout(() => {
        if (!attemptNext.current()) {
          setState({ status: "error", message: "Aucune installation de l’extension n’a répondu. Rechargez Insta Saved Sync 4.2.1." });
        }
      }, 2_500);
      return true;
    };
    return () => {
      if (attemptTimer.current) window.clearTimeout(attemptTimer.current);
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as { channel?: string; type?: string; requestId?: string; payload?: Record<string, unknown> };
      if (message.channel !== CHANNEL) return;
      if (message.type === "EXTENSION_READY") {
        const id = typeof message.payload?.extensionId === "string" ? message.payload.extensionId : null;
        const version = typeof message.payload?.version === "string" ? message.payload.version : "0";
        if (id) {
          candidates.current.set(id, version);
          setExtensionReady(true);
        }
        return;
      }
      if (!requestId.current || message.requestId !== requestId.current) return;
      if (message.payload?.extensionId !== currentTarget.current) return;
      if (message.type === "START_RESULT" && message.payload?.ok !== true) {
        if (attemptTimer.current) window.clearTimeout(attemptTimer.current);
        if (attemptNext.current()) return;
        setState({ status: "error", message: startErrorMessage(message.payload?.error) });
      }
      if (message.type === "START_RESULT" && message.payload?.ok === true && attemptTimer.current) {
        window.clearTimeout(attemptTimer.current);
        attemptTimer.current = null;
      }
      if (message.type === "STATE" && message.payload?.ok !== true) {
        setState({ status: "error", message: "La communication avec l’extension a été interrompue. Rechargez l’extension puis réessayez." });
        return;
      }
      if (message.type !== "STATE" || message.payload?.ok !== true) return;
      const task = message.payload.task as { status?: string; stats?: { synced?: number }; error?: string; resumeAt?: string | null; pausedReason?: { note?: string } | null } | null;
      if (!task) return;
      const synced = task.stats?.synced ?? 0;
      if (task.status === "completed") {
        setState({ status: "success", synced });
        onCompleted();
      } else if (task.status === "failed") {
        setState({ status: "error", message: task.error ?? "La synchronisation a échoué." });
      } else if (task.status === "paused" && !task.resumeAt) {
        setState({ status: "error", message: "Synchronisation en pause. Vérifiez votre session Instagram puis relancez." });
      } else if (task.status === "paused") {
        const resumeTime = new Date(task.resumeAt as string).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
        setState({
          status: "paused",
          synced,
          message: `${task.pausedReason?.note ?? "La synchronisation attend avant de réessayer."} Reprise automatique vers ${resumeTime}.`,
        });
      } else {
        setState({ status: "running", synced });
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ channel: CHANNEL, type: "DISCOVER" }, window.location.origin);
    return () => {
      window.removeEventListener("message", onMessage);
      if (attemptTimer.current) window.clearTimeout(attemptTimer.current);
    };
  }, [onCompleted]);

  const start = async () => {
    setState({ status: "starting" });
    try {
      attempted.current.clear();
      const candidate = nextCandidate(candidates.current, attempted.current);
      if (!candidate) throw new Error("EXTENSION_NOT_FOUND");
      const response = await fetch("/api/sync/session", { method: "POST" });
      if (!response.ok) throw new Error("SESSION_FAILED");
      const payload = await response.json() as Record<string, unknown>;
      requestId.current = crypto.randomUUID();
      syncPayload.current = payload;
      currentTarget.current = null;
      if (!attemptNext.current()) throw new Error("EXTENSION_NOT_FOUND");
      window.setTimeout(() => {
        setState((current) => current.status === "starting"
          ? { status: "error", message: "Extension introuvable. Installez ou rechargez Insta Saved Sync." }
          : current);
      }, 5_000);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error && error.message === "EXTENSION_NOT_FOUND"
          ? "Extension introuvable. Installez ou rechargez Insta Saved Sync 4.2.1."
          : "Impossible de créer la session de synchronisation.",
      });
    }
  };

  const busy = state.status === "starting" || state.status === "running";
  const label = state.status === "running"
    ? `${state.synced} nouveau${state.synced > 1 ? "x" : ""}`
    : state.status === "paused"
      ? `En pause (${state.synced})`
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
      {state.status === "paused" ? <span className="sync-status" role="status">{state.message}</span> : null}
      {state.status === "error" ? <span className="sync-error" role="alert">{state.message}</span> : null}
    </div>
  );
}
