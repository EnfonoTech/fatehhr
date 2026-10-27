import { listPending, setError, removeEntry } from "./queue";
import type { QueueRecord } from "./db";

export type Processor = (entry: QueueRecord) => Promise<void>;

const processors = new Map<string, Processor>();

export function registerProcessor(kind: string, fn: Processor) {
  processors.set(kind, fn);
}

let draining = false;

const DRAIN_LOCK = "fatehhr-offline-drain";

/**
 * Non-reentrant drain. `draining` is claimed synchronously so overlapping
 * triggers in this page (network listener + SyncBar mount + tap) never run
 * two passes over the same queue. Where the Web Locks API exists, the pass
 * also holds a cross-context lock (`ifAvailable`: skip, don't wait), so two
 * open tabs/windows of the PWA can't both submit the same queued item.
 */
export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      await locks.request(DRAIN_LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) await drainPass();
      });
    } else {
      await drainPass();
    }
  } finally {
    draining = false;
  }
}

async function drainPass(): Promise<void> {
  const rows = await listPending();
  const sorted = [...rows].sort((a, b) => {
    const pa = prerequisiteOf(a);
    const pb = prerequisiteOf(b);
    if (pa && !pb) return 1;
    if (pb && !pa) return -1;
    return a.insertionOrder - b.insertionOrder;
  });
  const completed = new Set<string>();

  for (const row of sorted) {
    const p = processors.get(row.kind);
    if (!p) continue;
    const prereq = prerequisiteOf(row);
    if (prereq && !completed.has(prereq) && rows.some((r) => r.logicalKey === prereq)) {
      continue;
    }
    try {
      await p(row);
      await removeEntry(row.id);
      completed.add(row.logicalKey);
    } catch (e) {
      if (isUnrecoverable(e)) {
        await removeEntry(row.id);
      } else {
        await setError(row.id, {
          code: (e as { name?: string })?.name || "Error",
          message: (e as Error)?.message || String(e),
        });
      }
    }
  }
}

/**
 * Narrow — match only server-signalled definitive failures (frappe-vue-pwa §4.5).
 * Bare substrings like "duplicate" without word boundary would misfire.
 */
const UNRECOVERABLE_RE = /\b(DuplicateEntryError|LinkExistsError)\b|ValidationError:\s+Already\s+exists/;

/** Thrown by a processor when the server refused the item for good. */
export class UnrecoverableError extends Error {
  name = "UnrecoverableError";
}

export function isUnrecoverable(e: unknown): boolean {
  if (e instanceof UnrecoverableError) return true;
  const msg = (e as Error)?.message || String(e);
  return UNRECOVERABLE_RE.test(msg);
}

export function isDraining() {
  return draining;
}

function prerequisiteOf(entry: QueueRecord): string | null {
  if (entry.kind === "task_timer_stop") {
    const clientSessionId = (entry.payload as { clientSessionId?: string })?.clientSessionId;
    return clientSessionId ? `start:${clientSessionId}` : null;
  }
  return null;
}
