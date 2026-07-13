const CHANNEL = "INSTA_POST_EXPLORER_SYNC_V2";
const ALLOWED_ORIGINS = new Set([
  "https://insta-saved-post-explorer.vercel.app",
  "http://localhost:3000",
]);

let pollTimer = null;
const extensionInfo = {
  extensionId: chrome.runtime.id,
  version: chrome.runtime.getManifest().version,
};

window.addEventListener("message", (event) => {
  if (event.source !== window || !ALLOWED_ORIGINS.has(event.origin)) return;
  const message = event.data;
  if (!message || message.channel !== CHANNEL) return;
  if (message.type === "DISCOVER") {
    announceReady();
    return;
  }
  if (message.type !== "START") return;
  if (message.targetExtensionId !== extensionInfo.extensionId) return;
  if (typeof message.requestId !== "string" || typeof message.payload?.token !== "string") return;

  try {
    chrome.runtime.sendMessage({ type: "startWebSync", data: message.payload }, (response) => {
      post("START_RESULT", message.requestId, withExtension(response ?? { ok: false, error: "EXTENSION_UNAVAILABLE" }));
      if (response?.ok) startPolling(message.requestId);
    });
  } catch {
    post("START_RESULT", message.requestId, withExtension({ ok: false, error: "EXTENSION_UNAVAILABLE" }));
  }
});

function startPolling(requestId) {
  if (pollTimer) clearInterval(pollTimer);
  const poll = () => chrome.runtime.sendMessage({ type: "getWebSyncState" }, (response) => {
    if (chrome.runtime.lastError) {
      post("STATE", requestId, withExtension({ ok: false, error: "EXTENSION_UNAVAILABLE" }));
      return;
    }
    post("STATE", requestId, withExtension(response));
    const status = response?.task?.status;
    if (["completed", "failed"].includes(status)) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
  poll();
  pollTimer = setInterval(poll, 1500);
}

function post(type, requestId, payload) {
  window.postMessage({ channel: CHANNEL, type, requestId, payload }, window.location.origin);
}

function withExtension(payload) {
  return { ...(payload ?? {}), extensionId: extensionInfo.extensionId };
}

function announceReady() {
  window.postMessage({ channel: CHANNEL, type: "EXTENSION_READY", payload: extensionInfo }, window.location.origin);
}

announceReady();
