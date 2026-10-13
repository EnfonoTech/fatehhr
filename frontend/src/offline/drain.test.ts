import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueueRecord } from "./db";

const rows: QueueRecord[] = [];
vi.mock("./queue", () => ({
  listPending: vi.fn(async () => [...rows]),
  removeEntry: vi.fn(async (id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
  }),
  setError: vi.fn(async () => undefined),
}));

import { drain, registerProcessor } from "./drain";

function row(id: string): QueueRecord {
  return {
    id,
    kind: "test-kind",
    logicalKey: `k:${id}`,
    payload: { client_id: `cid-${id}` },
    effectiveImages: [],
    createdAt: new Date().toISOString(),
    insertionOrder: rows.length + 1,
    attempts: 0,
  } as QueueRecord;
}

afterEach(() => {
  rows.length = 0;
  vi.unstubAllGlobals();
});

describe("drain is non-reentrant", () => {
  it("overlapping drains submit each queued item exactly once", async () => {
    const seen: string[] = [];
    registerProcessor("test-kind", async (e) => {
      seen.push(e.id);
      await new Promise((r) => setTimeout(r, 20)); // slow network
    });
    rows.push(row("a"), row("b"));

    // network listener + SyncBar mount + SyncBar tap, all at once
    await Promise.all([drain(), drain(), drain()]);

    expect(seen).toEqual(["a", "b"]);
    expect(rows).toHaveLength(0);
  });

  it("skips the pass when another context holds the Web Lock", async () => {
    const seen: string[] = [];
    registerProcessor("test-kind", async (e) => {
      seen.push(e.id);
    });
    rows.push(row("c"));
    const request = vi.fn(
      async (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<void>) => cb(null),
    );
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });

    await drain();

    expect(request).toHaveBeenCalledWith("fatehhr-offline-drain", { ifAvailable: true }, expect.any(Function));
    expect(seen).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
