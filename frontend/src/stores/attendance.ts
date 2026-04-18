import { defineStore } from "pinia";
import { attendanceApi, type MonthResp, type DayRec } from "@/api/attendance";
import { openDb, STORE } from "@/offline/db";

function cacheKey(y: number, m: number) {
  return `attendance.month:${y}-${m}`;
}

export const useAttendanceStore = defineStore("attendance", {
  state: () => ({
    current: null as MonthResp | null,
    loading: false,
  }),
  actions: {
    async loadMonth(year: number, month: number) {
      this.loading = true;
      const db = await openDb();
      try {
        const resp = await attendanceApi.month(year, month);
        this.current = resp;
        await db.put(STORE.cache, resp, cacheKey(year, month));
      } catch {
        const cached = (await db.get(STORE.cache, cacheKey(year, month))) as
          | MonthResp
          | undefined;
        this.current = cached ?? null;
      } finally {
        this.loading = false;
      }
    },
    dayFor(date: string): DayRec | null {
      return this.current?.days.find((d) => d.date === date) ?? null;
    },
  },
});
