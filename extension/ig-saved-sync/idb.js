/* eslint-disable @typescript-eslint/no-unused-vars */
// Shared IndexedDB layer.
//
// Persists export state so a long run survives the MV3 service worker being
// killed (Chrome stops idle workers after ~30s). The cursor, every collected
// page, and downloaded media blobs are written to disk as we go, so a killed
// run resumes exactly where it stopped instead of starting over.
//
// It also keeps a lightweight "seen index" (the pk of every post ever
// exported, plus the newest pk) so an incremental update can stop as soon as
// it reaches posts already captured.
//
// Stores:
//   tasks   : one record per export run, keyed by TASK_ID
//   pages   : collected rows, one record per fetched page (taskId + seq)
//   media   : downloaded binary blobs, keyed by URL
//   archive : durable cross-run index { id:"index", seenPks:[], newestPk, count }

const DB_NAME = "ig-saved-exporter";
const DB_VERSION = 2;

export const TASK_ID = "saved-export";
export const ARCHIVE_ID = "index";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pages")) {
        const pages = db.createObjectStore("pages", { keyPath: "id" });
        pages.createIndex("taskId_seq", ["taskId", "seq"]);
      }
      // v2 additions
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains("archive")) {
        db.createObjectStore("archive", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const result = fn(t.objectStore(store));
        t.oncomplete = () => {
          // If fn returned a reqAsValue wrapper, unwrap to its actual value
          // (which may legitimately be undefined for an absent key). Otherwise
          // resolve the raw return value.
          if (result && typeof result === "object" && result.__isReqValue) {
            resolve(result.value);
          } else {
            resolve(result);
          }
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

// Marker wrapper so tx knows to unwrap an IDBRequest's result after completion.
function reqAsValue(request) {
  return { __isReqValue: true, get value() { return request.result; } };
}

// --- Task state -------------------------------------------------------------

export const TaskStore = {
  async get() {
    return tx("tasks", "readonly", (store) => reqAsValue(store.get(TASK_ID)));
  },
  async put(task) {
    task.updatedAt = new Date().toISOString();
    return tx("tasks", "readwrite", (store) => {
      store.put(task);
    });
  },
  async clear() {
    return tx("tasks", "readwrite", (store) => {
      store.delete(TASK_ID);
    });
  },
};

// Generic task accessor by id (used for the separate media-download task).
export const TaskStoreRaw = {
  async get(id) {
    return tx("tasks", "readonly", (store) => reqAsValue(store.get(id)));
  },
  async put(task) {
    return tx("tasks", "readwrite", (store) => {
      store.put(task);
    });
  },
  async clear(id) {
    return tx("tasks", "readwrite", (store) => {
      store.delete(id);
    });
  },
};

// --- Collected pages --------------------------------------------------------

export const PageStore = {
  async add(taskId, seq, rows, raw) {
    return tx("pages", "readwrite", (store) => {
      store.put({ id: `${taskId}:${seq}`, taskId, seq, rows, raw: raw ?? null });
    });
  },
  async all(taskId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction("pages", "readonly");
      const index = t.objectStore("pages").index("taskId_seq");
      const range = IDBKeyRange.bound([taskId, -Infinity], [taskId, Infinity]);
      const out = [];
      index.openCursor(range).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          out.push(cursor.value);
          cursor.continue();
        }
      };
      t.oncomplete = () => resolve(out.sort((a, b) => a.seq - b.seq));
      t.onerror = () => reject(t.error);
    });
  },
  async clear(taskId) {
    const pages = await PageStore.all(taskId);
    return tx("pages", "readwrite", (store) => {
      for (const p of pages) store.delete(p.id);
    });
  },
};

// --- Downloaded media -------------------------------------------------------

export const MediaStore = {
  async has(url) {
    const key = await tx("media", "readonly", (store) => reqAsValue(store.getKey(url)));
    return key !== undefined && key !== null;
  },
  async save(record) {
    return tx("media", "readwrite", (store) => {
      store.put(record);
    });
  },
  async get(url) {
    return tx("media", "readonly", (store) => reqAsValue(store.get(url)));
  },
  async count() {
    return tx("media", "readonly", (store) => reqAsValue(store.count()));
  },
  async allKeys() {
    return tx("media", "readonly", (store) => reqAsValue(store.getAllKeys()));
  },
  async clearAll() {
    return tx("media", "readwrite", (store) => {
      store.clear();
    });
  },
};

// --- Durable cross-run archive index ---------------------------------------

export const ArchiveStore = {
  async get() {
    const rec = await tx("archive", "readonly", (store) => reqAsValue(store.get(ARCHIVE_ID)));
    return rec ?? { id: ARCHIVE_ID, seenPks: [], newestPk: null, count: 0, lastExportAt: null };
  },
  async put(record) {
    record.id = ARCHIVE_ID;
    return tx("archive", "readwrite", (store) => {
      store.put(record);
    });
  },
};
