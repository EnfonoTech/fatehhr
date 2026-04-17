import { openDB } from "idb";
export const DB_NAME = "fatehhr";
export const DB_VERSION = 1;
export const STORE = {
    queue: "queue",
    photos: "photos",
    cache: "cache",
    meta: "meta",
};
let dbPromise = null;
export function openDb() {
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
    if (!dbPromise)
        return;
    const db = await dbPromise;
    db.close();
    await indexedDB.deleteDatabase(DB_NAME);
    dbPromise = null;
}
