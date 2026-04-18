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

export const expenseApi = {
  submit: (lines: ExpenseLine[], company?: string) =>
    apiCall<{ name: string; total_claimed_amount: number }>(
      "POST",
      "fatehhr.api.expense.submit_claim",
      { lines, company },
    ),
  list_mine: () => apiCall<ExpenseClaimRow[]>("GET", "fatehhr.api.expense.list_mine"),
};
