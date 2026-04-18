import { defineStore } from "pinia";
import { checkinApi, type CheckinRow } from "@/api/checkin";
import { saveItem } from "@/offline/queue";
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

export const useCheckinStore = defineStore("checkin", {
  state: () => ({
    currentStatus: null as "IN" | "OUT" | null,
    currentTask: null as string | null,
    lastRow: null as CheckinRow | null,
    history: [] as CheckinRow[],
  }),
  actions: {
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
      } catch {
        /* offline — keep whatever is in memory */
      }
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
