import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";
import { uploadPhoto } from "@/offline/photos";

interface ExpenseLinePayload {
  expense_type: string;
  expense_date: string;
  amount: number;
  description: string;
  receipt_photo_id?: string | null;
  receipt_file_url?: string | null;
}

registerProcessor("expense", async (entry: QueueRecord) => {
  const p = entry.payload as { lines: ExpenseLinePayload[]; company?: string | null };
  const resolved = [] as {
    expense_type: string;
    expense_date: string;
    amount: number;
    description: string;
    receipt_file_url: string | null;
  }[];
  for (const ln of p.lines) {
    let url = ln.receipt_file_url ?? null;
    if (!url && ln.receipt_photo_id) {
      url = await uploadPhoto(ln.receipt_photo_id);
    }
    resolved.push({
      expense_type: ln.expense_type,
      expense_date: ln.expense_date,
      amount: ln.amount,
      description: ln.description,
      receipt_file_url: url,
    });
  }
  await apiCall("POST", "fatehhr.api.expense.submit_claim", {
    lines: resolved,
    company: p.company,
  });
});
