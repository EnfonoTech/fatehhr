import { defineStore } from "pinia";
import { expenseApi, type ExpenseLine, type ExpenseClaimRow, type ExpenseSummary } from "@/api/expense";
import { ApiError } from "@/api/client";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { uploadPhoto } from "@/offline/photos";
import { v4 as uuid } from "uuid";

export interface DraftLine {
  expense_type: string;
  expense_date: string;
  amount: number;
  description: string;
  receipt_photo_id: string | null;
}

export const useExpenseStore = defineStore("expense", {
  state: () => ({
    mine: [] as ExpenseClaimRow[],
    summary: null as ExpenseSummary | null,
  }),
  actions: {
    async loadMine() {
      try {
        this.mine = await expenseApi.list_mine();
      } catch {
        /* offline */
      }
    },
    async loadSummary() {
      try {
        this.summary = await expenseApi.summary();
      } catch {
        /* offline */
      }
    },

    async submit(lines: DraftLine[]) {
      const sync = useSyncStore();
      if (lines.some((l) => !l.receipt_photo_id)) {
        throw new Error("Every line needs a receipt photo.");
      }
      const claimDraftId = uuid();

      if (sync.isOnline) {
        try {
          const resolved: ExpenseLine[] = [];
          for (const ln of lines) {
            const url = await uploadPhoto(ln.receipt_photo_id!);
            resolved.push({
              expense_type: ln.expense_type,
              expense_date: ln.expense_date,
              amount: ln.amount,
              description: ln.description,
              receipt_file_url: url,
            });
          }
          const r = await expenseApi.submit(resolved);
          await this.loadMine();
          await this.loadSummary();
          return { mode: "online" as const, row: r };
        } catch (err) {
          // ApiError = server validation failed (bad expense type, missing
          // category, etc). Surface it — don't queue something the server
          // will reject again, that just fills the sync-errors screen.
          if (err instanceof ApiError) throw err;
          /* network failure — queue below */
        }
      }

      await saveItem(
        "expense",
        `expense:${claimDraftId}`,
        { lines: lines.map((ln) => ({ ...ln })) },
        lines.map((ln) => ln.receipt_photo_id!).filter(Boolean) as string[],
      );
      await sync.refresh();
      return { mode: "queued" as const };
    },
  },
});
