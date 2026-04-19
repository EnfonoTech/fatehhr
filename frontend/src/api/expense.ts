import { apiCall } from "./client";

export interface ExpenseLine {
  expense_type: string;
  expense_date: string;
  amount: number;
  description: string;
  receipt_file_url?: string | null;
}

export interface ExpenseClaimRow {
  name: string;
  posting_date: string;
  total_claimed_amount: number;
  total_sanctioned_amount: number;
  status: string;
  approval_status: string;
}

export interface ExpenseSummary {
  claimed: number;
  pending: number;
  approved: number;
  paid: number;
  count: number;
}

export interface ExpenseClaimDetail {
  name: string;
  posting_date: string | null;
  status: string;
  approval_status: string;
  total_claimed_amount: number;
  total_sanctioned_amount: number;
  lines: {
    expense_date: string | null;
    expense_type: string;
    description: string;
    amount: number;
    sanctioned_amount: number;
  }[];
}

export const expenseApi = {
  submit: (lines: ExpenseLine[], company?: string) =>
    apiCall<{ name: string; total_claimed_amount: number }>(
      "POST",
      "fatehhr.api.expense.submit_claim",
      { lines, company },
    ),
  list_mine: () => apiCall<ExpenseClaimRow[]>("GET", "fatehhr.api.expense.list_mine"),
  summary: () => apiCall<ExpenseSummary>("GET", "fatehhr.api.expense.summary"),
  detail: (name: string) =>
    apiCall<ExpenseClaimDetail>("GET", "fatehhr.api.expense.detail", { name }),
};
