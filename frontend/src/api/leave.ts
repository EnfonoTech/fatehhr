import { apiCall } from "./client";

export interface LeaveTypeBalance {
  leave_type: string;
  label: string;
  balance: number;
  total: number;
  color: string | null;
  /** Leave Without Pay — HRMS skips balance/allocation checks. */
  is_lwp?: boolean;
  /** Leave Type tolerates a negative balance. */
  allow_negative?: boolean;
  /** A submitted Leave Allocation covers today. */
  has_allocation?: boolean;
}

export type ClientApprovalRequired = "Not Required" | "Yes";
export type ClientApprovalReceived = "No" | "Yes";

export interface LeaveApplyPayload {
  leave_type: string;
  from_date: string;
  to_date: string;
  half_day?: 0 | 1;
  reason?: string;
  /** Only sent on sites with the cooperheat client-approval fields. */
  client_approval_required?: ClientApprovalRequired;
  client_approval_received?: ClientApprovalReceived;
  client_approval_attachment?: string | null;
}

export interface LeaveRow {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  half_day: number;
  total_leave_days: number;
  description: string;
  status: string;
  custom_client_approval_required?: ClientApprovalRequired | null;
  custom_client_approval_received?: ClientApprovalReceived | null;
  custom_client_approval_attachment?: string | null;
}

export const leaveApi = {
  types_with_balance: () =>
    apiCall<LeaveTypeBalance[]>("GET", "fatehhr.api.leave.types_with_balance"),
  form_config: () =>
    apiCall<{ client_approval: boolean }>("GET", "fatehhr.api.leave.form_config"),
  // GET drops bodies (apiCall) — params go in the query string.
  leave_days: (p: { leave_type: string; from_date: string; to_date: string; half_day: 0 | 1 }) =>
    apiCall<{ days: number }>(
      "GET",
      `fatehhr.api.leave.leave_days?${new URLSearchParams({
        leave_type: p.leave_type,
        from_date: p.from_date,
        to_date: p.to_date,
        half_day: String(p.half_day),
      }).toString()}`,
    ),
  apply: (p: LeaveApplyPayload) =>
    apiCall<{ name: string; status: string; total_leave_days: number }>(
      "POST",
      "fatehhr.api.leave.apply",
      p,
    ),
  cancel: (name: string) =>
    apiCall<{ name: string; status: string }>(
      "POST",
      "fatehhr.api.leave.cancel",
      { name },
    ),
  list_mine: () => apiCall<LeaveRow[]>("GET", "fatehhr.api.leave.list_mine"),
};
