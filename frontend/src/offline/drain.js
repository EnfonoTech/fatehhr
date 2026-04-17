import { listPending, setError, removeEntry } from "./queue";
const processors = new Map();
export function registerProcessor(kind, fn) {
    processors.set(kind, fn);
}
let draining = false;
export async function drain() {
    if (draining)
        return;
    draining = true;
    try {
        const rows = await listPending();
        const sorted = [...rows].sort((a, b) => {
            const pa = prerequisiteOf(a);
            const pb = prerequisiteOf(b);
            if (pa && !pb)
                return 1;
            if (pb && !pa)
                return -1;
            return a.insertionOrder - b.insertionOrder;
        });
        const completed = new Set();
        for (const row of sorted) {
            const p = processors.get(row.kind);
            if (!p)
                continue;
            const prereq = prerequisiteOf(row);
            if (prereq && !completed.has(prereq) && rows.some((r) => r.logicalKey === prereq)) {
                continue;
            }
            try {
                await p(row);
                await removeEntry(row.id);
                completed.add(row.logicalKey);
            }
            catch (e) {
                if (isUnrecoverable(e)) {
                    await removeEntry(row.id);
                }
                else {
                    await setError(row.id, {
                        code: e?.name || "Error",
                        message: e?.message || String(e),
                    });
                }
            }
        }
    }
    finally {
        draining = false;
    }
}
/**
 * Narrow — match only server-signalled definitive failures (frappe-vue-pwa §4.5).
 * Bare substrings like "duplicate" without word boundary would misfire.
 */
const UNRECOVERABLE_RE = /\b(DuplicateEntryError|LinkExistsError)\b|ValidationError:\s+Already\s+exists/;
export function isUnrecoverable(e) {
    const msg = e?.message || String(e);
    return UNRECOVERABLE_RE.test(msg);
}
export function isDraining() {
    return draining;
}
function prerequisiteOf(entry) {
    if (entry.kind === "task_timer_stop") {
        const clientSessionId = entry.payload?.clientSessionId;
        return clientSessionId ? `start:${clientSessionId}` : null;
    }
    return null;
}
