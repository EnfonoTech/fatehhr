import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "fatehhr";
export const DB_VERSION = 1;

export const STORE = {
  queue: "queue",
  photos: "photos",
  cache: "cache",
  meta: "meta",
} as const;

export interface QueueRecord {
  id: string;
  kind: string;
  logicalKey: string;
  payload: unknown;
  effectiveImages: string[];
  createdAt: string;
  insertionOrder: number;
  attempts: number;
  lastError?: { at: string; code: string; message: string };
}

export interface PhotoRecord {
  id: string;
  blob: Blob;
  mime: string;
  serverUrl?: string;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function openDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const q = db.createObjectStore(STORE.queue, { keyPath: "id" });
          q.createIndex("insertionOrder", "insertionOrder");
          q.createIndex("kindLogical", ["kind", "logicalKey"], { unique: false });
          db.createObjectStore(STORE.photos, { keyPath: "id" });
          db.createObjectStore(STORE.cache);
          db.createObjectStore(STORE.meta);
        }
      },
    });
  }
  return dbPromise;
}

export async function resetDb() {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  await indexedDB.deleteDatabase(DB_NAME);
  dbPromise = null;
}
