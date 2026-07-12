const CHANNEL = "INSTA_POST_EXPLORER_SYNC_V1";
const ALLOWED_ORIGINS = new Set([
  "https://insta-saved-post-explorer.vercel.app",
  "http://localhost:3000",
]);

let pollTimer = null;

window.addEventListener("message", (event) => {
  if (event.source !== window || !ALLOWED_ORIGINS.has(event.origin)) return;
  const message = event.data;
  if (!message || message.channel !== CHANNEL || message.type !== "START") return;
  if (typeof message.requestId !== "string" || typeof message.payload?.token !== "string") return;

  chrome.runtime.sendMessage({ type: "startWebSync", data: message.payload }, (response) => {
    post("START_RESULT", message.requestId, response ?? { ok: false, error: "EXTENSION_UNAVAILABLE" });
    if (response?.ok) startPolling(message.requestId);
  });
});

function startPolling(requestId) {
  if (pollTimer) clearInterval(pollTimer);
  const poll = () => chrome.runtime.sendMessage({ type: "getWebSyncState" }, (response) => {
    if (chrome.runtime.lastError) {
      post("STATE", requestId, { ok: false, error: "EXTENSION_UNAVAILABLE" });
      return;
    }
    post("STATE", requestId, response);
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

window.postMessage({ channel: CHANNEL, type: "EXTENSION_READY" }, window.location.origin);
