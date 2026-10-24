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
  /** Cooperheat: true if this user is an attendance approver. */
  is_approver?: boolean;
}

export interface SalaryPackage {
  allowed: boolean;
  ctc?: number;
  current?: {
    from_date: string;
    currency: string;
    earnings: { label: string; value: number }[];
    deductions: { label: string; value: number }[];
    total_earnings: number;
    total_deductions: number;
    net_fixed: number;
  } | null;
}

export const meApi = {
  personal: () => apiCall<{ employee: string | null; fields: Record<string, string | number> }>("GET", "fatehhr.api.me.personal"),
  salary: () => apiCall<SalaryPackage>("GET", "fatehhr.api.me.salary"),
  profile: () => apiCall<Profile>("GET", "fatehhr.api.me.profile"),
  updateProfile: (patch: Partial<Profile>) =>
    apiCall<{ applied: Partial<Profile> }>("POST", "fatehhr.api.me.update_profile", patch),
};
