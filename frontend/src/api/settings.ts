import { apiCall } from "./client";

export type AttendanceMode = "Checkin Based" | "Timer Based";

export interface PublicSettings {
  attendance_mode: AttendanceMode;
}

export const settingsApi = {
  getPublic: () =>
    apiCall<PublicSettings>("POST", "fatehhr.api.settings.get_public", {}),
};
