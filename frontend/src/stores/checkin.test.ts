import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const create = vi.fn();
vi.mock("@/api/checkin", () => ({ checkinApi: { create: (p: unknown) => create(p) } }));
const saveItem = vi.fn(async () => ({}));
let pending: unknown[] = [];
vi.mock("@/offline/queue", () => ({
  saveItem: (...a: unknown[]) => saveItem(...(a as [])),
  listPending: async () => pending,
}));
vi.mock("@/offline/photos", () => ({ uploadPhoto: async () => "/files/x.jpg" }));
vi.mock("@/stores/sync", () => ({
  useSyncStore: () => ({ isOnline: true, refresh: async () => undefined }),
}));

import { useCheckinStore, type CheckinSubmit } from "./checkin";

const payload: CheckinSubmit = {
  log_type: "IN",
  latitude: 24.7,
  longitude: 46.6,
  address: null,
  task: null,
  selfie_photo_id: null,
};

beforeEach(() => {
  setActivePinia(createPinia());
  create.mockReset();
  saveItem.mockClear();
  pending = [];
});

describe("checkin submit idempotency", () => {
  it("a second submit while one is in flight reuses it (one server call)", async () => {
    let resolve!: (v: unknown) => void;
    create.mockReturnValue(new Promise((r) => (resolve = r)));
    const store = useCheckinStore();

    const p1 = store.submit(payload);
    const p2 = store.submit(payload); // double tap
    resolve({ name: "EMP-CKIN-1", log_type: "IN", custom_task: null });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);

    // Next, separate action is allowed again (fresh key).
    create.mockResolvedValue({ name: "EMP-CKIN-2", log_type: "OUT", custom_task: null });
    await store.submit({ ...payload, log_type: "OUT" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].client_id).not.toBe(create.mock.calls[1][0].client_id);
  });

  it("an online failure queues the SAME client_id for the retry", async () => {
    create.mockRejectedValue(new Error("timeout"));
    const store = useCheckinStore();

    const res = await store.submit(payload);

    expect(res.mode).toBe("queued");
    const sentKey = create.mock.calls[0][0].client_id;
    expect(sentKey).toBeTruthy();
    const queued = (saveItem.mock.calls[0] as unknown[])[2] as { client_id: string };
    expect(queued.client_id).toBe(sentKey);
  });
});

describe("queued state vs the server", () => {
  const queuedIn = (timestamp: string) => ({
    kind: "checkin",
    insertionOrder: 1,
    payload: { log_type: "IN", task: null, timestamp },
  });

  it("an old queued IN that never synced does not override a newer server OUT", async () => {
    // iOS 2026-10: a stuck IN from early October kept the button on "Check Out"
    pending = [queuedIn("2026-10-06T13:01:00.000Z")];
    const store = useCheckinStore();
    store.lastRow = { name: "EMP-CKIN-9", log_type: "OUT", time: "2026-10-27T15:35:22.000Z" } as never;
    store.currentStatus = "OUT";
    await store.applyQueuedState();
    expect(store.currentStatus).toBe("OUT");
  });

  it("a queued punch newer than the server's last one still wins (offline IN)", async () => {
    pending = [queuedIn("2026-10-27T16:00:00.000Z")];
    const store = useCheckinStore();
    store.lastRow = { name: "EMP-CKIN-9", log_type: "OUT", time: "2026-10-27T15:35:22.000Z" } as never;
    store.currentStatus = "OUT";
    await store.applyQueuedState();
    expect(store.currentStatus).toBe("IN");
  });
});
