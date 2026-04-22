import { defineStore } from "pinia";
import { settingsApi, type AttendanceMode } from "@/api/settings";

// Cache in localStorage so the first paint (offline or cold start) doesn't
// render the wrong Check-in mode and bounce the user around.
const LS_KEY = "fatehhr.settings";

interface Persisted {
  attendance_mode: AttendanceMode;
  cached_at: number;
}

function readCache(): Persisted | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
}

export const useSettingsStore = defineStore("settings", {
  state: () => {
    const cached = readCache();
    return {
      attendance_mode: (cached?.attendance_mode ?? "Checkin Based") as AttendanceMode,
      loaded: Boolean(cached),
    };
  },
  getters: {
    isTimerBased: (s) => s.attendance_mode === "Timer Based",
    isCheckinBased: (s) => s.attendance_mode === "Checkin Based",
  },
  actions: {
    async refresh() {
      try {
        const s = await settingsApi.getPublic();
        this.attendance_mode = s.attendance_mode;
        this.loaded = true;
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            attendance_mode: this.attendance_mode,
            cached_at: Date.now(),
          } as Persisted),
        );
      } catch {
        /* offline — keep cache */
      }
    },
  },
});
