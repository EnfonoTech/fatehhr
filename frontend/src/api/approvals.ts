import { apiCall } from "./client";

export interface ApprovalRow {
  name: string;
  employee: string;
  employee_name: string | null;
  attendance_date: string | null;
  status: string | null;
  /** UTC-ISO (…Z). */
  in_time: string | null;
  /** UTC-ISO (…Z). */
  out_time: string | null;
  working_hours: number;
  current_approval_level: number;
  current_approver_name: string | null;
  workflow_state: string | null;
  /** UTC-ISO (…Z) — deadline before the cooperheat scheduler auto-approves. */
  window_expires_at: string | null;
  /** Detail-only. */
  department?: string | null;
}

export interface ApprovalSummary {
  enabled: boolean;
  is_approver: boolean;
  pending_count: number;
}

export interface ApprovalActionResult {
  name: string;
  workflow_state: string;
}

// NOTE: detail/approve/reject/list use POST so params travel in the body —
// apiCall("GET", …) drops the body (frappe.ts gotcha #3). summary takes no args.
export const approvalsApi = {
  summary: () => apiCall<ApprovalSummary>("GET", "fatehhr.api.approvals.summary"),
  listPending: (limit = 50) =>
    apiCall<ApprovalRow[]>("POST", "fatehhr.api.approvals.list_pending", { limit }),
  listDone: (limit = 30) =>
    apiCall<ApprovalRow[]>("POST", "fatehhr.api.approvals.list_done", { limit }),
  detail: (name: string) =>
    apiCall<ApprovalRow>("POST", "fatehhr.api.approvals.detail", { name }),
  approve: (name: string, in_time?: string | null, out_time?: string | null) =>
    apiCall<ApprovalActionResult>("POST", "fatehhr.api.approvals.approve", {
      name,
      in_time: in_time ?? null,
      out_time: out_time ?? null,
    }),
  reject: (name: string, reason?: string | null) =>
    apiCall<ApprovalActionResult>("POST", "fatehhr.api.approvals.reject", {
      name,
      reason: reason ?? null,
    }),
};
