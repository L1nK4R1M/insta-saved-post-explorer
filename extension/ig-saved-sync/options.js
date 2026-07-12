/* eslint-disable @typescript-eslint/no-unused-vars */
// Options page controller.
//
// The export runs in the background service worker and persists to IndexedDB,
// so this page is a live view: it polls task state, renders progress with an
// ETA and a thumbnail contact sheet, and assembles CSV/JSON downloads on
// demand. Media files are streamed to disk by the background worker.

const CSV_COLUMNS = [
  "pk", "id", "code", "permalink", "media_type", "taken_at", "caption", "hashtags",
  "like_count", "comment_count", "play_count", "video_duration", "image_url",
  "video_url", "carousel_count", "carousel_media_urls",
  "product_type", "music_title", "music_artist", "original_audio_title",
  "accessibility_caption", "owner_username", "owner_pk",
];

const el = (id) => document.getElementById(id);
const ui = {
  themeToggle: el("themeToggle"), themeIcon: el("themeIcon"),
  loginDot: el("loginDot"), loginText: el("loginText"),
  archive: el("archive"), archiveCount: el("archiveCount"), archiveMeta: el("archiveMeta"),
  setup: el("setup"), collectionId: el("collectionId"), includeMedia: el("includeMedia"),
  startBtn: el("startBtn"),
  progress: el("progress"), count: el("count"), eta: el("eta"),
  barTrack: el("barTrack"), barFill: el("barFill"), barPct: el("barPct"), mediaStat: el("mediaStat"),
  thumbs: el("thumbs"),
  sampleBtn: el("sampleBtn"), pauseBtn: el("pauseBtn"),
  paused: el("paused"), pausedTitle: el("pausedTitle"), pausedNote: el("pausedNote"),
  pausedCount: el("pausedCount"), resumeBtn: el("resumeBtn"), discardBtn: el("discardBtn"),
  result: el("result"), resultText: el("resultText"), stats: el("stats"),
  dlCsv: el("dlCsv"), dlJson: el("dlJson"), newBtn: el("newBtn"),
  mediaBox: el("mediaBox"), mediaChoice: el("mediaChoice"), mediaStart: el("mediaStart"),
  mediaBtn: el("mediaBtn"), mediaProgress: el("mediaProgress"),
  mediaDone: el("mediaDone"), mediaTotal: el("mediaTotal"), mediaFailed: el("mediaFailed"),
  mediaBar: el("mediaBar"), mediaPause: el("mediaPause"), mediaResume: el("mediaResume"),
  mediaDoneMsg: el("mediaDoneMsg"),
  message: el("message"),
};

const send = (type, extra) =>
  chrome.runtime.sendMessage({ type, ...(extra || {}) }).catch(() => null);

// --- theme ------------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  ui.themeIcon.textContent = theme === "dark" ? "☀" : "◐";
  try { localStorage.setItem("theme", theme); } catch {}
}
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(saved ?? (prefersDark ? "dark" : "light"));
})();
ui.themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

// --- progress tracking for ETA ---------------------------------------------

let runStart = null;
let startCount = 0;

// --- rendering --------------------------------------------------------------

function showOnly(section) {
  for (const s of [ui.setup, ui.progress, ui.paused, ui.result]) s.hidden = true;
  if (section) section.hidden = false;
}

function fmtDuration(ms) {
  if (!isFinite(ms) || ms <= 0) return "";
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `~${m} min left`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `~${h}h ${r}m left`;
}

function renderArchive(archive) {
  if (archive && archive.count > 0) {
    ui.archive.hidden = false;
    ui.archiveCount.textContent = archive.count.toLocaleString();
    ui.archiveMeta.textContent = archive.lastExportAt
      ? `last export ${new Date(archive.lastExportAt).toLocaleDateString()}`
      : "";
  } else {
    ui.archive.hidden = true;
  }
}

async function renderThumbs() {
  const res = await send("getThumbs", { limit: 12 });
  if (!res?.ok || !res.thumbs.length) return;
  ui.thumbs.innerHTML = "";
  for (const url of res.thumbs) {
    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    img.onerror = () => img.remove();
    ui.thumbs.appendChild(img);
  }
}

function render(task, archive) {
  renderArchive(archive);

  if (!task) {
    showOnly(ui.setup);
    return;
  }

  switch (task.status) {
    case "pending":
    case "running": {
      showOnly(ui.progress);
      const n = task.processedCount ?? 0;
      ui.count.textContent = n.toLocaleString();

      // ETA from throughput since this view started watching.
      if (runStart == null) { runStart = Date.now(); startCount = n; }
      const elapsed = Date.now() - runStart;
      const gained = n - startCount;
      if (gained > 3 && elapsed > 5000) {
        const perPost = elapsed / gained;
        // We don't know the true total; estimate against archive if incremental,
        // otherwise show throughput-based rolling estimate is not meaningful, so
        // show a live rate instead.
        const ratePerMin = (gained / elapsed) * 60000;
        ui.eta.textContent = `${ratePerMin.toFixed(0)}/min`;
      } else {
        ui.eta.textContent = "";
      }

      // Progress bar: indeterminate (we can't know the total up front).
      ui.barTrack.classList.add("indeterminate");
      ui.barPct.textContent = task.mode === "incremental" ? "update mode" : "scanning";
      const md = task.stats?.mediaDownloaded ?? 0;
      ui.mediaStat.textContent = task.includeMedia ? `${md} media files saved` : "";

      renderThumbs();
      break;
    }

    case "paused": {
      showOnly(ui.paused);
      const reason = task.pausedReason?.reason ?? "manual";
      ui.pausedTitle.textContent = reason === "manual" ? "Paused" : `Paused — ${reason.replace(/_/g, " ")}`;
      let note = task.pausedReason?.note ?? "";
      if (task.resumeAt) note += ` Auto-resumes around ${new Date(task.resumeAt).toLocaleTimeString()}.`;
      ui.pausedNote.textContent = note;
      ui.pausedCount.textContent = (task.processedCount ?? 0).toLocaleString();
      break;
    }

    case "completed":
      showOnly(ui.result);
      renderResult(task);
      break;

    case "failed":
      showOnly(ui.setup);
      showMessage(task.error ?? "Export failed.");
      break;

    default:
      showOnly(ui.setup);
  }
}

function statCard(num, label) {
  return `<div class="stat"><span class="stat-num">${num.toLocaleString()}</span><span class="stat-lbl">${label}</span></div>`;
}

function renderResult(task) {
  const total = task.totalCount ?? task.processedCount ?? 0;
  ui.resultText.textContent =
    total === 0
      ? (task.mode === "incremental" ? "No new saved posts since your last export." : "No saved posts found.")
      : `Done. ${total.toLocaleString()} ${task.mode === "incremental" ? "new " : ""}post${total === 1 ? "" : "s"} exported.`;

  const s = task.stats ?? {};
  let html =
    statCard(s.photos ?? 0, "Photos") +
    statCard(s.videos ?? 0, "Videos") +
    statCard(s.carousels ?? 0, "Carousels") +
    statCard(s.mediaDownloaded ?? 0, "Media files");
  ui.stats.innerHTML = `<div class="stats-grid" style="display:contents">${html}</div>`;

  // Top owners list.
  const owners = Object.entries(s.owners ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (owners.length) {
    const rows = owners.map(([u, c]) => `<div class="owner-row"><span>@${u}</span><span>${c}</span></div>`).join("");
    const block = document.createElement("div");
    block.className = "top-owners";
    block.innerHTML = `<h3>Most saved accounts</h3>${rows}`;
    ui.stats.appendChild(block);
  }

}

function showMessage(text) { ui.message.textContent = text; ui.message.hidden = false; }
function hideMessage() { ui.message.hidden = true; }

// --- login ------------------------------------------------------------------

async function refreshLogin() {
  const res = await send("checkLogin");
  if (res?.ok) {
    ui.loginDot.className = "dot live";
    ui.loginText.textContent = "Signed in to Instagram.";
    ui.startBtn.disabled = false;
  } else {
    ui.loginDot.className = "dot off";
    ui.loginText.textContent = "Not signed in. Log in on instagram.com, then reload.";
    ui.startBtn.disabled = true;
  }
}

// --- downloads --------------------------------------------------------------

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function buildCsv(rows) {
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\r\n");
}
function buildJson(rows, raw) {
  const posts = raw.length === rows.length ? rows.map((r, i) => ({ ...r, _raw: raw[i] })) : rows;
  return JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, posts }, null, 2);
}
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }
function download(filename, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Pull all rows from the background in page-batches to stay under Chrome's
// 64 MiB per-message limit, then build the file. includeRaw pulls the heavy
// _raw objects (JSON only).
async function fetchAllRows(includeRaw, onProgress) {
  const meta = await send("getPageCount");
  if (!meta?.ok) throw new Error("Could not read collected data.");
  const total = meta.pageCount;
  // Small batch when raw is included (raw objects are large), bigger otherwise.
  const batch = includeRaw ? 15 : 60;
  const rows = [];
  const raw = [];
  for (let from = 0; from < total; from += batch) {
    const to = Math.min(from + batch, total);
    const res = await send("getRowsBatch", { from, to, includeRaw });
    if (!res?.ok) throw new Error("Could not read a data batch.");
    for (const r of res.rows) rows.push(r);
    if (includeRaw) for (const m of res.raw) raw.push(m);
    onProgress?.(to, total);
  }
  return { rows, raw };
}

async function doDownload(kind) {
  const label = kind === "csv" ? ui.dlCsv : ui.dlJson;
  const original = label.textContent;
  label.disabled = true;
  hideMessage();
  try {
    if (kind === "csv") {
      const { rows } = await fetchAllRows(false, (done, total) => {
        label.textContent = `CSV ${Math.round((done / total) * 100)}%`;
      });
      if (!rows.length) { showMessage("Nothing collected yet."); return; }
      download(`instagram-saved-${stamp()}.csv`, "text/csv", buildCsv(rows));
    } else {
      const { rows, raw } = await fetchAllRows(true, (done, total) => {
        label.textContent = `JSON ${Math.round((done / total) * 100)}%`;
      });
      if (!rows.length) { showMessage("Nothing collected yet."); return; }
      download(`instagram-saved-${stamp()}.json`, "application/json", buildJson(rows, raw));
    }
  } catch (err) {
    showMessage(err?.message ?? "Could not read collected data.");
  } finally {
    label.disabled = false;
    label.textContent = original;
  }
}

// --- events -----------------------------------------------------------------

ui.startBtn.addEventListener("click", async () => {
  hideMessage();
  runStart = null;
  const mode = document.querySelector('input[name="mode"]:checked')?.value ?? "full";
  await send("startExport", {
    data: {
      collectionId: ui.collectionId.value.trim(),
      includeMedia: ui.includeMedia.checked,
      mode,
    },
  });
  poll();
});
ui.sampleBtn.addEventListener("click", () => doDownload("csv"));
ui.pauseBtn.addEventListener("click", async () => { await send("pauseExport"); poll(); });
ui.resumeBtn.addEventListener("click", async () => { runStart = null; await send("resumeExport"); poll(); });
ui.discardBtn.addEventListener("click", async () => { await send("resetExport"); poll(); });
ui.newBtn.addEventListener("click", async () => { await send("clearMediaDownload"); await send("resetExport"); poll(); });
ui.dlCsv.addEventListener("click", () => doDownload("csv"));
ui.dlJson.addEventListener("click", () => doDownload("json"));

// --- media download panel ---------------------------------------------------

function renderMediaTask(mt) {
  if (!mt || mt.status === "idle") {
    ui.mediaStart.hidden = false;
    ui.mediaChoice.style.display = "";
    ui.mediaProgress.hidden = true;
    ui.mediaDoneMsg.hidden = true;
    return;
  }
  if (mt.status === "completed") {
    ui.mediaStart.hidden = true;
    ui.mediaChoice.style.display = "none";
    ui.mediaProgress.hidden = true;
    ui.mediaDoneMsg.hidden = false;
    const failedNote = mt.failed > 0 ? ` ${mt.failed} could not be fetched (expired links).` : "";
    ui.mediaDoneMsg.textContent = `Done. ${mt.downloaded.toLocaleString()} files saved to Downloads/instagram-saved/.${failedNote}`;
    return;
  }
  // pending / running / paused
  ui.mediaStart.hidden = true;
  ui.mediaChoice.style.display = "none";
  ui.mediaProgress.hidden = false;
  ui.mediaDoneMsg.hidden = true;
  ui.mediaDone.textContent = (mt.downloaded + mt.skipped).toLocaleString();
  ui.mediaTotal.textContent = mt.total.toLocaleString();
  ui.mediaFailed.textContent = mt.failed > 0 ? `· ${mt.failed} failed` : "";
  const pct = mt.total ? Math.round((mt.index / mt.total) * 100) : 0;
  ui.mediaBar.style.width = `${pct}%`;
  ui.mediaPause.hidden = mt.status === "paused";
  ui.mediaResume.hidden = mt.status !== "paused";
}

ui.mediaBtn.addEventListener("click", async () => {
  const filter = document.querySelector('input[name="mfilter"]:checked')?.value ?? "all";
  await send("startMediaDownload", { data: { filter } });
  pollMedia();
});
ui.mediaPause.addEventListener("click", async () => { await send("pauseMediaDownload"); pollMedia(); });
ui.mediaResume.addEventListener("click", async () => { await send("resumeMediaDownload"); pollMedia(); });

async function pollMedia() {
  const res = await send("getMediaTask");
  renderMediaTask(res?.task ?? null);
}

// --- import media from an existing JSON/CSV file ----------------------------

const importEls = {
  box: el("importBox"), fileBtn: el("fileBtn"), fileInput: el("fileInput"),
  fileName: el("fileName"), choice: el("importChoice"), start: el("importStart"),
  importBtn: el("importBtn"), progress: el("importProgress"),
  done: el("impDone"), total: el("impTotal"), failed: el("impFailed"),
  bar: el("impBar"), pause: el("impPause"), resume: el("impResume"),
  doneMsg: el("impDoneMsg"), seedNote: el("seedNote"),
};

let parsedTargets = null;

// Make a string safe for a path segment (mirrors the background sanitizer).
function sanitizeSegment(name) {
  const cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 60)
    .trim();
  return cleaned || "unknown";
}

// Derive a filename from a URL and post code.
function fileNameFor(url, code, idx, type) {
  const ext = type === "video" ? "mp4" : "jpg";
  const suffix = idx == null ? "" : `_${idx + 1}`;
  return `${code || "post"}${suffix}.${ext}`;
}

function guessTypeFromUrl(url) {
  return /\.mp4|\/v\/|video/i.test(url) ? "video" : "photo";
}

// Build download targets from parsed rows. Handles three shapes, in order of
// richness: _raw carousel objects, carousel_media_urls string, single urls.
// Files are placed under an author subfolder: instagram-saved/<author>/<code>.
function targetsFromRows(rows, filter) {
  const targets = [];
  const seen = new Set();
  const add = (url, code, idx, type, author) => {
    if (!url || seen.has(url)) return;
    if (filter === "photos" && type === "video") return;
    seen.add(url);
    const filename = fileNameFor(url, code, idx, type);
    const path = `instagram-saved/${sanitizeSegment(author)}/${filename}`;
    targets.push({ url, filename, path, type });
  };

  for (const row of rows) {
    const code = row.code || (row.permalink ? row.permalink.split("/").filter(Boolean).pop() : "");
    const author = row.owner_username || row._raw?.user?.username || "unknown";

    // Richest: raw carousel children.
    if (row._raw?.carousel_media?.length) {
      row._raw.carousel_media.forEach((child, i) => {
        const v = child.video_versions?.[0]?.url;
        const img = child.image_versions2?.candidates?.[0]?.url;
        if (child.media_type === 2 && v) add(v, code, i, "video", author);
        else if (img) add(img, code, i, "photo", author);
      });
      continue;
    }

    // Next: our carousel_media_urls column (pipe-separated).
    if (row.carousel_media_urls) {
      const urls = String(row.carousel_media_urls).split("|").map((s) => s.trim()).filter(Boolean);
      urls.forEach((u, i) => add(u, code, i, guessTypeFromUrl(u), author));
      continue;
    }

    // Single media.
    if (row.video_url) add(row.video_url, code, null, "video", author);
    if (row.image_url) add(row.image_url, code, null, "photo", author);
  }
  return targets;
}

// Parse a CSV string into row objects (handles quoted fields).
function parseCsv(text) {
  const rows = [];
  let field = "", record = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { record.push(field); field = ""; }
      else if (c === "\n") { record.push(field); rows.push(record); record = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
}

async function parseFile(file) {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    const posts = Array.isArray(data) ? data : data.posts ?? [];
    return posts;
  }
  return parseCsv(text);
}

importEls.fileBtn.addEventListener("click", () => importEls.fileInput.click());

importEls.fileInput.addEventListener("change", async () => {
  const file = importEls.fileInput.files?.[0];
  if (!file) return;
  importEls.fileName.textContent = file.name;
  importEls.doneMsg.hidden = true;
  try {
    const rows = await parseFile(file);
    if (!rows.length) { showMessage("No posts found in that file."); return; }
    parsedTargets = { rows };
    importEls.choice.hidden = false;
    importEls.start.hidden = false;
    hideMessage();

    // Same file also restores "Update only": extract post pks and seed the
    // archive so incremental exports know what's already been fetched.
    const pks = [];
    for (const row of rows) {
      const pk = row.pk ?? row._raw?.pk;
      if (pk) pks.push(String(pk));
    }
    if (pks.length) {
      const res = await send("seedArchiveFromPks", { pks, newestPk: pks[0] });
      if (res?.ok) {
        importEls.seedNote.hidden = false;
        importEls.seedNote.textContent = `Also restored "Update only": ${res.count.toLocaleString()} posts marked as already fetched.`;
        poll();
      }
    }
  } catch (err) {
    showMessage(`Could not read that file: ${err?.message ?? err}`);
  }
});

importEls.importBtn.addEventListener("click", async () => {
  if (!parsedTargets) return;
  const filter = document.querySelector('input[name="ifilter"]:checked')?.value ?? "all";
  const targets = targetsFromRows(parsedTargets.rows, filter);
  if (!targets.length) { showMessage("No media URLs found in that file."); return; }
  await send("startMediaFromTargets", { targets });
  importEls.start.hidden = true;
  importEls.choice.hidden = true;
  importEls.progress.hidden = false;
  pollImport();
});
importEls.pause.addEventListener("click", async () => { await send("pauseMediaDownload"); pollImport(); });
importEls.resume.addEventListener("click", async () => { await send("resumeMediaDownload"); pollImport(); });

el("resetMediaBtn").addEventListener("click", async () => {
  await send("clearMediaStore");
  await send("clearMediaDownload");
  showMessage("Download history cleared. You can start the media download again.");
  importEls.progress.hidden = true;
  importEls.doneMsg.hidden = true;
  if (parsedTargets) { importEls.start.hidden = false; importEls.choice.hidden = false; }
});

function renderImport(mt) {
  if (!mt) return;
  if (mt.status === "completed") {
    importEls.progress.hidden = true;
    importEls.doneMsg.hidden = false;
    const failedNote = mt.failed > 0 ? ` ${mt.failed} could not be fetched (expired links).` : "";
    importEls.doneMsg.textContent = `Done. ${mt.downloaded.toLocaleString()} files saved to Downloads/instagram-saved/.${failedNote}`;
    return;
  }
  importEls.progress.hidden = false;
  importEls.done.textContent = (mt.downloaded + mt.skipped).toLocaleString();
  importEls.total.textContent = mt.total.toLocaleString();
  importEls.failed.textContent = mt.failed > 0 ? `· ${mt.failed} failed` : "";
  const pct = mt.total ? Math.round((mt.index / mt.total) * 100) : 0;
  importEls.bar.style.width = `${pct}%`;
  importEls.pause.hidden = mt.status === "paused";
  importEls.resume.hidden = mt.status !== "paused";
}

async function pollImport() {
  const res = await send("getMediaTask");
  if (res?.ok && res.task?.filter === "imported") renderImport(res.task);
}


// --- polling ----------------------------------------------------------------

async function poll() {
  const res = await send("getState");
  render(res?.task ?? null, res?.archive ?? null);
  // When a completed export is on screen, also reflect any media-download task.
  if (res?.task?.status === "completed") pollMedia();

  // Import box is available whenever no export is actively running.
  const running = res?.task && (res.task.status === "running" || res.task.status === "pending");
  importEls.box.hidden = !!running;
  pollImport();
}

refreshLogin();
poll();
setInterval(poll, 1500);
