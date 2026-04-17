import { apiCall } from "./client";

export interface Profile {
  user: string;
  full_name: string;
  employee: string | null;
  designation: string | null;
  department: string | null;
  employee_id?: string;
  photo?: string | null;
  emergency_phone_number?: string;
  person_to_be_contacted?: string;
  relation?: string;
  bank_name?: string;
  bank_ac_no?: string;
  iban?: string;
}

export const meApi = {
  profile: () => apiCall<Profile>("GET", "fatehhr.api.me.profile"),
  updateProfile: (patch: Partial<Profile>) =>
    apiCall<{ applied: Partial<Profile> }>("POST", "fatehhr.api.me.update_profile", patch),
};
