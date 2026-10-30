import { defineStore } from "pinia";
import { approvalsApi, type ApprovalRow, type ApprovalSummary, type SiteHoursEdit } from "@/api/approvals";

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
        // a weekly approver (Cooperheat) can have a whole week waiting
        this.pending = await approvalsApi.listPending(500);
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

    /** Online-only. Payable / Billable per site row; returns the refreshed detail. */
    async updateSiteHours(name: string, rows: SiteHoursEdit[]) {
      this.detail = await approvalsApi.updateSiteHours(name, rows);
      return this.detail;
    },

    /** Online-only. Edits the raw checkin times; returns the refreshed detail. */
    async updateCheckins(name: string, edits: { checkin: string; time: string }[]) {
      this.detail = await approvalsApi.updateCheckinTimes(name, edits);
      return this.detail;
    },

    /** Online-only. Re-throws on failure (no queue). Returns the new state so the
     *  caller can tell "advanced a level" from "fully approved". */
    async approve(name: string, inTime?: string | null, outTime?: string | null) {
      const res = await approvalsApi.approve(name, inTime, outTime);
      await Promise.all([this.loadPending(), this.loadDone(), this.loadSummary()]);
      return res;
    },

    /** Online-only. Approves every listed record assigned to me in one go. */
    async approveAll(names: string[]) {
      const res = await approvalsApi.approveAll(names);
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
