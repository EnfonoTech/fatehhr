import { apiCall } from "./client";

export interface LeaveTypeBalance {
  leave_type: string;
  label: string;
  balance: number;
  color: string | null;
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
}

export const leaveApi = {
  types_with_balance: () =>
    apiCall<LeaveTypeBalance[]>("GET", "fatehhr.api.leave.types_with_balance"),
  apply: (p: {
    leave_type: string;
    from_date: string;
    to_date: string;
    half_day?: 0 | 1;
    reason?: string;
  }) =>
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
