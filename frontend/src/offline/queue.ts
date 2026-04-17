import { openDb, STORE, type QueueRecord } from "./db";
import { v4 as uuid } from "uuid";

export async function saveItem(
  kind: string,
  logicalKey: string,
  payload: unknown,
  effectiveImages: string[],
): Promise<QueueRecord> {
  const db = await openDb();
  const tx = db.transaction([STORE.queue, STORE.meta], "readwrite");
  const queueStore = tx.objectStore(STORE.queue);
  const metaStore = tx.objectStore(STORE.meta);
  const index = queueStore.index("kindLogical");
  const existing = (await index.get([kind, logicalKey])) as QueueRecord | undefined;

  const counter = ((await metaStore.get("insertionCounter")) as number | undefined) ?? 0;
  const nextCounter = counter + 1;

  const record: QueueRecord = {
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
  if (!existing) await metaStore.put(nextCounter, "insertionCounter");
  await tx.done;
  return record;
}

export async function listPending(): Promise<QueueRecord[]> {
  const db = await openDb();
  const rows = await db.getAllFromIndex(STORE.queue, "insertionOrder");
  return rows as QueueRecord[];
}

export async function countPending(): Promise<number> {
  const db = await openDb();
  return await db.count(STORE.queue);
}

export async function setError(
  id: string,
  error: { code: string; message: string },
): Promise<void> {
  const db = await openDb();
  const row = (await db.get(STORE.queue, id)) as QueueRecord | undefined;
  if (!row) return;
  row.attempts += 1;
  row.lastError = { at: new Date().toISOString(), ...error };
  await db.put(STORE.queue, row);
}

export async function removeEntry(id: string): Promise<void> {
  const db = await openDb();
  await db.delete(STORE.queue, id);
}
