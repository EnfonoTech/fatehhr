import { apiCall } from "./client";

export interface TaskRow {
  name: string;
  subject: string;
  project: string | null;
  status: string;
  priority: string;
  exp_end_date: string | null;
  custom_latitude: number | null;
  custom_longitude: number | null;
  custom_geofence_radius_m: number | null;
}

export const taskApi = {
  list_mine: () => apiCall<TaskRow[]>("GET", "fatehhr.api.task.list_mine"),
  start_timer: (p: {
    task: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    timestamp: string;
    client_id?: string;
  }) =>
    apiCall<{
      session_id: string;
      checkin_name: string | null;
      timesheet: string;
      custom_geofence_status: string;
    }>("POST", "fatehhr.api.task.start_timer", p),
  stop_timer: (p: {
    session_id: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    timestamp: string;
    client_id?: string;
  }) =>
    apiCall<{
      session_id: string;
      checkin_out_name: string | null;
      timesheet: string;
      hours: number;
    }>("POST", "fatehhr.api.task.stop_timer", p),
};
