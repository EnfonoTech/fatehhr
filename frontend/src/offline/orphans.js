import { openDb, STORE } from "./db";
import { setError } from "./queue";
/**
 * Marks queue entries whose referenced photo blobs are missing
 * (frappe-vue-pwa §4.6). NEVER deletes the queue entry — only annotates
 * with `lastError` so the user can see and decide in Sync Errors.
 */
export async function flagOrphans() {
    const db = await openDb();
    const queue = (await db.getAll(STORE.queue));
    let flagged = 0;
    for (const entry of queue) {
        for (const photoId of entry.effectiveImages) {
            const exists = await db.get(STORE.photos, photoId);
            if (!exists) {
                await setError(entry.id, {
                    code: "BlobMissing",
                    message: `Photo ${photoId} blob is missing — please re-attach.`,
                });
                flagged++;
                break;
            }
        }
    }
    return flagged;
}
