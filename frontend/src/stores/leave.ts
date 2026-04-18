import { defineStore } from "pinia";
import { leaveApi, type LeaveTypeBalance, type LeaveRow } from "@/api/leave";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";

export interface PendingLocalLeave {
  draftId: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: "pending-sync";
}

export const useLeaveStore = defineStore("leave", {
  state: () => ({
    types: [] as LeaveTypeBalance[],
    mine: [] as LeaveRow[],
    pendingLocal: [] as PendingLocalLeave[],
  }),
  actions: {
    async loadTypes() {
      try {
        this.types = await leaveApi.types_with_balance();
      } catch {
        /* offline */
      }
    },
    async loadMine() {
      try {
        this.mine = await leaveApi.list_mine();
      } catch {
        /* offline */
      }
    },

    async apply(p: {
      leave_type: string;
      from_date: string;
      to_date: string;
      half_day: 0 | 1;
      reason: string;
    }) {
      const sync = useSyncStore();
      if (sync.isOnline) {
        try {
          const r = await leaveApi.apply(p);
          await this.loadMine();
          return { mode: "online" as const, row: r };
        } catch {
          /* fall through */
        }
      }
      const draftId = uuid();
      await saveItem("leave", `leave:${draftId}`, p, []);
      this.pendingLocal.push({
        draftId,
        leave_type: p.leave_type,
        from_date: p.from_date,
        to_date: p.to_date,
        status: "pending-sync",
      });
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async cancel(name: string) {
      await leaveApi.cancel(name);
      await this.loadMine();
    },
  },
});
