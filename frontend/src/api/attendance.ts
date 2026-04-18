import { apiCall } from "./client";

export interface DayRec {
  date: string;
  status: string;
  hours_worked: number;
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
  summary: { present: number; absent: number; on_leave: number; total_hours: number };
}

export const attendanceApi = {
  month: (year: number, month: number) =>
    apiCall<MonthResp>("POST", "fatehhr.api.attendance.month", { year, month }),
};
