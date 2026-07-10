/// <reference lib="webworker" />

type ParseRequest = { file: File };
type ParseResponse =
  | { ok: true; entries: unknown[] }
  | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  try {
    const parsed: unknown = JSON.parse(await event.data.file.text());
    const entries = extractWorkerEntries(parsed);
    self.postMessage({ ok: true, entries } satisfies ParseResponse);
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Le fichier JSON est invalide.",
    } satisfies ParseResponse);
  }
};

function extractWorkerEntries(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object" && "items" in input) {
    const items = (input as { items?: unknown }).items;
    if (Array.isArray(items)) return items;
  }
  throw new Error("Le JSON doit contenir un tableau ou une enveloppe avec un champ items.");
}

export {};
