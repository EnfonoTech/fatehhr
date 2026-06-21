import { apiCall } from "./client";

export interface DayRec {
  date: string;
  status: string;
  hours_worked: number;
  /** Cooperheat: present only on tenants with the approval workflow. */
  workflow_state?: string | null;
  current_approver_name?: string | null;
  pairs: {
    in: string;
    out: string;
    task: string | null;
    location: string | null;
    hours: number;
    open_pair_autoclosed?: boolean;
  }[];
}

export interface MonthResp {
  year: number;
  month: number;
  days: DayRec[];
  summary: {
    present: number;
    absent: number;
    on_leave: number;
    pending_approval?: number;
    total_hours: number;
  };
}

export const attendanceApi = {
  month: (year: number, month: number) =>
    apiCall<MonthResp>("POST", "fatehhr.api.attendance.month", { year, month }),
};
