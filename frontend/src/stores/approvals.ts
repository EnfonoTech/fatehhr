import { defineStore } from "pinia";
import { approvalsApi, type ApprovalRow, type ApprovalSummary } from "@/api/approvals";

/**
 * Attendance approvals (cooperheat). Approve/Reject are deliberately
 * ONLINE-ONLY — they are never queued. Approval windows expire and the
 * cooperheat scheduler auto-approves on lapse, so a stale offline action could
 * fire against an already-handled or reassigned record. The mutating actions
 * here re-throw on failure; the calling view surfaces the message and tells the
 * user to reconnect.
 */
export const useApprovalsStore = defineStore("approvals", {
  state: () => ({
    summary: { enabled: false, is_approver: false, pending_count: 0 } as ApprovalSummary,
    pending: [] as ApprovalRow[],
    done: [] as ApprovalRow[],
    detail: null as ApprovalRow | null,
    loading: false,
  }),
  actions: {
    async loadSummary() {
      try {
        this.summary = await approvalsApi.summary();
      } catch {
        /* offline — keep last known */
      }
    },

    async loadPending() {
      this.loading = true;
      try {
        this.pending = await approvalsApi.listPending();
      } finally {
        this.loading = false;
      }
    },

    async loadDone() {
      try {
        this.done = await approvalsApi.listDone();
      } catch {
        /* offline */
      }
    },

    async loadDetail(name: string) {
      this.detail = await approvalsApi.detail(name);
    },

    /** Online-only. Re-throws on failure (no queue). Returns the new state so the
     *  caller can tell "advanced a level" from "fully approved". */
    async approve(name: string, inTime?: string | null, outTime?: string | null) {
      const res = await approvalsApi.approve(name, inTime, outTime);
      await Promise.all([this.loadPending(), this.loadDone(), this.loadSummary()]);
      return res;
    },

    /** Online-only. Re-throws on failure (no queue). */
    async reject(name: string, reason?: string | null) {
      const res = await approvalsApi.reject(name, reason);
      await Promise.all([this.loadPending(), this.loadDone(), this.loadSummary()]);
      return res;
    },
  },
});
