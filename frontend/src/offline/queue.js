import { openDb, STORE } from "./db";
import { v4 as uuid } from "uuid";
export async function saveItem(kind, logicalKey, payload, effectiveImages) {
    const db = await openDb();
    const tx = db.transaction([STORE.queue, STORE.meta], "readwrite");
    const queueStore = tx.objectStore(STORE.queue);
    const metaStore = tx.objectStore(STORE.meta);
    const index = queueStore.index("kindLogical");
    const existing = (await index.get([kind, logicalKey]));
    const counter = (await metaStore.get("insertionCounter")) ?? 0;
    const nextCounter = counter + 1;
    const record = {
        id: existing?.id ?? uuid(),
        kind,
        logicalKey,
        payload,
        effectiveImages: [...effectiveImages],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        insertionOrder: existing?.insertionOrder ?? nextCounter,
        attempts: existing?.attempts ?? 0,
        lastError: undefined,
    };
    await queueStore.put(record);
    if (!existing)
        await metaStore.put(nextCounter, "insertionCounter");
    await tx.done;
    return record;
}
export async function listPending() {
    const db = await openDb();
    const rows = await db.getAllFromIndex(STORE.queue, "insertionOrder");
    return rows;
}
export async function countPending() {
    const db = await openDb();
    return await db.count(STORE.queue);
}
export async function setError(id, error) {
    const db = await openDb();
    const row = (await db.get(STORE.queue, id));
    if (!row)
        return;
    row.attempts += 1;
    row.lastError = { at: new Date().toISOString(), ...error };
    await db.put(STORE.queue, row);
}
export async function removeEntry(id) {
    const db = await openDb();
    await db.delete(STORE.queue, id);
}
