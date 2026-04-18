import { defineStore } from "pinia";
import { payslipApi, type PayslipRow, type PayslipDetail } from "@/api/payslip";
import { openDb, STORE } from "@/offline/db";

export const PDF_CACHE_LIMIT = 3;
const PREFIX = "payslip:pdf:";
const ORDER_KEY = "payslip:pdf:order";
const MAX_BYTES = 5 * 1024 * 1024;

export async function putPdfCache(slipName: string, blob: Blob): Promise<void> {
  if (blob.size > MAX_BYTES) return;
  const db = await openDb();
  await db.put(STORE.cache, blob, `${PREFIX}${slipName}`);
  const order = ((await db.get(STORE.cache, ORDER_KEY)) as string[] | undefined) ?? [];
  const next = [slipName, ...order.filter((n) => n !== slipName)].slice(0, PDF_CACHE_LIMIT);
  for (const o of order) {
    if (!next.includes(o)) await db.delete(STORE.cache, `${PREFIX}${o}`);
  }
  await db.put(STORE.cache, next, ORDER_KEY);
}

export async function getPdfCache(slipName: string): Promise<Blob | null> {
  const db = await openDb();
  return ((await db.get(STORE.cache, `${PREFIX}${slipName}`)) as Blob | undefined) ?? null;
}

export const usePayslipStore = defineStore("payslip", {
  state: () => ({
    list: [] as PayslipRow[],
    current: null as PayslipDetail | null,
  }),
  actions: {
    async loadList() {
      try { this.list = await payslipApi.list_mine(); } catch { /* offline */ }
    },
    async loadDetail(name: string) {
      try { this.current = await payslipApi.detail(name); } catch { /* offline */ }
    },
    async fetchPdf(name: string): Promise<Blob> {
      const cached = await getPdfCache(name);
      if (cached) return cached;
      const blob = await payslipApi.pdfBlob(name);
      await putPdfCache(name, blob);
      return blob;
    },
  },
});
