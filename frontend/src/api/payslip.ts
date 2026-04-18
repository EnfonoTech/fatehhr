import { apiCall } from "./client";
import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export interface PayslipRow {
  name: string;
  start_date: string;
  end_date: string;
  posting_date: string;
  gross_pay: number;
  total_deduction: number;
  net_pay: number;
  currency: string;
  status: string;
}

export interface PayslipDetail {
  name: string;
  posting_date: string;
  start_date: string;
  end_date: string;
  gross_pay: number;
  net_pay: number;
  total_deduction: number;
  currency: string;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
}

export const payslipApi = {
  list_mine: () => apiCall<PayslipRow[]>("GET", "fatehhr.api.payslip.list_mine"),
  detail: (name: string) =>
    apiCall<PayslipDetail>("POST", "fatehhr.api.payslip.detail", { name }),
  async pdfBlob(name: string): Promise<Blob> {
    const s = useSessionStore();
    const r = await fetch(
      `${API_BASE()}/api/method/fatehhr.api.payslip.pdf?name=${encodeURIComponent(name)}`,
      {
        headers: s.apiKey && s.apiSecret
          ? { Authorization: `token ${s.apiKey}:${s.apiSecret}` }
          : {},
        credentials: API_BASE() ? "omit" : "include",
      },
    );
    if (!r.ok) throw new Error(`payslip pdf ${r.status}`);
    return await r.blob();
  },
};
