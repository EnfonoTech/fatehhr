import { defineStore } from "pinia";
import { checkinApi } from "@/api/checkin";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";
import { uploadPhoto } from "@/offline/photos";
export const useCheckinStore = defineStore("checkin", {
    state: () => ({
        currentStatus: null,
        currentTask: null,
        lastRow: null,
        history: [],
    }),
    actions: {
        async refreshToday() {
            try {
                const today = new Date().toISOString().slice(0, 10);
                const rows = await checkinApi.list({
                    from_date: `${today} 00:00:00`,
                    to_date: `${today} 23:59:59`,
                });
                const last = rows[0] ?? null;
                this.currentStatus = last?.log_type ?? null;
                this.currentTask = last?.custom_task ?? null;
                this.lastRow = last;
            }
            catch {
                /* offline is fine */
            }
        },
        async submit(payload) {
            const sync = useSyncStore();
            const timestamp = new Date().toISOString();
            const sessionId = uuid();
            const logicalKey = `checkin:${sessionId}`;
            const effectiveImages = payload.selfie_photo_id ? [payload.selfie_photo_id] : [];
            if (sync.isOnline) {
                try {
                    let selfie_file_url = null;
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
                    return { mode: "online", row };
                }
                catch {
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
            return { mode: "queued" };
        },
        async loadHistory(page = 1) {
            const rows = await checkinApi.list({ page, page_size: 30 });
            if (page === 1)
                this.history = rows;
            else
                this.history.push(...rows);
        },
    },
});
