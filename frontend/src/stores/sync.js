import { defineStore } from "pinia";
import { drain } from "@/offline/drain";
import { countPending, listPending } from "@/offline/queue";
import { flagOrphans } from "@/offline/orphans";
import { openDb, STORE } from "@/offline/db";
export const useSyncStore = defineStore("sync", {
    state: () => ({
        status: "idle",
        pending: 0,
        lastSyncedAt: null,
        isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
        errorCount: 0,
    }),
    actions: {
        async refresh() {
            this.pending = await countPending();
            const rows = await listPending();
            this.errorCount = rows.filter((r) => r.lastError).length;
            const db = await openDb();
            this.lastSyncedAt = (await db.get(STORE.meta, "lastSyncedAt")) || null;
        },
        async triggerDrain() {
            if (!this.isOnline) {
                this.status = "offline";
                return;
            }
            this.status = "syncing";
            await flagOrphans();
            await drain();
            const db = await openDb();
            await db.put(STORE.meta, new Date().toISOString(), "lastSyncedAt");
            await this.refresh();
            this.status = this.errorCount > 0 ? "errored" : "idle";
        },
        setOnline(online) {
            this.isOnline = online;
            if (online)
                this.triggerDrain();
            else
                this.status = "offline";
        },
    },
});
