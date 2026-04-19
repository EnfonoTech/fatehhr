import { defineStore } from "pinia";
import { checkinApi, type CheckinRow } from "@/api/checkin";
import { saveItem, listPending } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";
import { uploadPhoto } from "@/offline/photos";

export interface CheckinSubmit {
  log_type: "IN" | "OUT";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  task: string | null;
  selfie_photo_id: string | null;
}

// Persist the "what state is the user in right now?" slice across app kills.
// Offline users might check IN, kill the app, reopen still offline — without
// this they'd see the default "Check In" button and queue a second IN, which
// then explodes into a duplicate Attendance pair.
const LS_KEY = "fatehhr.checkin_state";

interface PersistedState {
  currentStatus: "IN" | "OUT" | null;
  currentTask: string | null;
  lastRow: CheckinRow | null;
}

function readPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { currentStatus: null, currentTask: null, lastRow: null };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      currentStatus: parsed.currentStatus ?? null,
      currentTask: parsed.currentTask ?? null,
      lastRow: parsed.lastRow ?? null,
    };
  } catch {
    return { currentStatus: null, currentTask: null, lastRow: null };
  }
}

function writePersisted(state: PersistedState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* storage full / disabled — fine */
  }
}

export const useCheckinStore = defineStore("checkin", {
  state: () => {
    const hydrated = readPersisted();
    return {
      currentStatus: hydrated.currentStatus,
      currentTask: hydrated.currentTask,
      lastRow: hydrated.lastRow,
      history: [] as CheckinRow[],
    };
  },
  actions: {
    _persist() {
      writePersisted({
        currentStatus: this.currentStatus,
        currentTask: this.currentTask,
        lastRow: this.lastRow,
      });
    },

    /** Read any pending check-in items from the offline queue and apply the
     *  latest one as our truth. This covers: offline IN → app killed → reopen
     *  still offline. Without this we'd show "Check In" again.
     */
    async applyQueuedState() {
      try {
        const pending = await listPending();
        const checkins = pending.filter((r) => r.kind === "checkin");
        if (!checkins.length) return;
        // insertionOrder is monotonically increasing — last item wins.
        checkins.sort((a, b) => a.insertionOrder - b.insertionOrder);
        const last = checkins[checkins.length - 1];
        const payload = last.payload as {
          log_type: "IN" | "OUT";
          task: string | null;
        };
        this.currentStatus = payload.log_type;
        this.currentTask = payload.task;
        this._persist();
      } catch {
        /* queue read failed — keep what we have */
      }
    },

    async refreshToday() {
      // State = "what IN/OUT is the user currently in?" — read the MOST RECENT
      // checkin regardless of "today" boundaries. Narrow UTC date filters were
      // racing midnight / timezone differences and flipping the button back to
      // "Check In" right after a successful check-in.
      try {
        const rows = await checkinApi.list({ page: 1, page_size: 1 });
        const last = rows[0] ?? null;
        this.currentStatus = last?.log_type ?? null;
        this.currentTask = last?.custom_task ?? null;
        this.lastRow = last;
        this._persist();
      } catch {
        /* offline — keep whatever is persisted */
      }
      // Queue may contain newer state than the server (offline submissions).
      await this.applyQueuedState();
    },

    async submit(payload: CheckinSubmit) {
      const sync = useSyncStore();
      const timestamp = new Date().toISOString();
      const sessionId = uuid();
      const logicalKey = `checkin:${sessionId}`;
      const effectiveImages = payload.selfie_photo_id ? [payload.selfie_photo_id] : [];

      if (sync.isOnline) {
        try {
          let selfie_file_url: string | null = null;
          if (payload.selfie_photo_id) {
            selfie_file_url = await uploadPhoto(payload.selfie_photo_id);
          }
          const row = await checkinApi.create({
            log_type: payload.log_type,
            latitude: payload.latitude,
            longitude: payload.longitude,
            address: payload.address,
            task: payload.task,
            selfie_file_url,
            timestamp,
          });
          this.currentStatus = row.log_type;
          this.currentTask = row.custom_task;
          this.lastRow = row;
          this._persist();
          return { mode: "online" as const, row };
        } catch {
          /* fall through to queue */
        }
      }

      await saveItem("checkin", logicalKey, {
        log_type: payload.log_type,
        latitude: payload.latitude,
        longitude: payload.longitude,
        address: payload.address,
        task: payload.task,
        selfie_photo_id: payload.selfie_photo_id,
        timestamp,
      }, effectiveImages);

      this.currentStatus = payload.log_type;
      this.currentTask = payload.task;
      this._persist();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async loadHistory(page: number = 1) {
      const rows = await checkinApi.list({ page, page_size: 30 });
      if (page === 1) this.history = rows;
      else this.history.push(...rows);
    },
  },
});
