import { openDb, STORE, type PhotoRecord } from "./db";
import { v4 as uuid } from "uuid";
import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export async function savePhoto(blob: Blob, mime: string): Promise<string> {
  const id = `photo:${uuid()}`;
  const db = await openDb();
  const rec: PhotoRecord = { id, blob, mime, createdAt: new Date().toISOString() };
  await db.put(STORE.photos, rec);
  return id;
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await openDb();
  return ((await db.get(STORE.photos, id)) as PhotoRecord | undefined) ?? null;
}

export async function removePhoto(id: string): Promise<void> {
  const db = await openDb();
  await db.delete(STORE.photos, id);
}

/**
 * The ONE uploader (frappe-vue-pwa §4.3). Identical path whether the op
 * came from the online happy path or from drain.
 *
 * - Returns the server file_url.
 * - Idempotent: a second call for the same photo id returns the cached URL.
 * - On network failure, throws; caller decides what to do.
 */
export async function uploadPhoto(photoId: string): Promise<string> {
  const db = await openDb();
  const row = (await db.get(STORE.photos, photoId)) as PhotoRecord | undefined;
  if (!row) throw new Error(`photo blob missing: ${photoId}`);
  if (row.serverUrl) return row.serverUrl;

  const session = useSessionStore();
  const form = new FormData();
  form.append("file", row.blob, `${photoId.replace(":", "-")}.jpg`);
  form.append("is_private", "0");

  const headers: Record<string, string> = { "X-Frappe-Site-Name": "fatehhr_dev" };
  if (session.apiKey && session.apiSecret) {
    headers["Authorization"] = `token ${session.apiKey}:${session.apiSecret}`;
  }

  const base = API_BASE();
  const r = await fetch(`${base}/api/method/upload_file`, {
    method: "POST",
    headers,
    credentials: base ? "omit" : "include",
    body: form,
  });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
  const data = await r.json();
  const url = data?.message?.file_url;
  if (!url) throw new Error("upload returned no file_url");

  row.serverUrl = url;
  await db.put(STORE.photos, row);
  return url;
}
