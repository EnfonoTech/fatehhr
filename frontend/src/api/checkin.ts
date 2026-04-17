import { apiCall } from "./client";

export interface CheckinRow {
  name: string;
  log_type: "IN" | "OUT";
  time: string;
  custom_task: string | null;
  custom_latitude: number | null;
  custom_longitude: number | null;
  custom_location_address: string | null;
  custom_selfie: string | null;
  custom_geofence_status: "disabled" | "inside" | "outside" | "unknown";
}

export const checkinApi = {
  create: (p: {
    log_type: "IN" | "OUT";
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    task: string | null;
    selfie_file_url?: string | null;
    timestamp: string;
  }) => apiCall<CheckinRow>("POST", "fatehhr.api.checkin.create", p),

  list: (p: { from_date?: string; to_date?: string; page?: number; page_size?: number }) =>
    apiCall<CheckinRow[]>("POST", "fatehhr.api.checkin.list_mine", p),
};
