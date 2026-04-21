import { defineStore } from "pinia";
import { taskApi, type TaskRow } from "@/api/task";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";
import { getCurrentCoords, hapticMedium } from "@/app/frappe";

interface RunningTimer {
  clientSessionId: string;
  serverSessionId: string | null;
  task: string;
  startedAt: string;
}

const RUNNING_KEY = "fatehhr.runningTimer";

export const useTasksStore = defineStore("tasks", {
  state: () => ({
    tasks: [] as TaskRow[],
    running: null as RunningTimer | null,
  }),
  actions: {
    async load() {
      // Restore running timer FIRST (synchronous) so the view never renders
      // a mid-flight empty state while the tasks list request is in flight.
      const raw = localStorage.getItem(RUNNING_KEY);
      if (raw) {
        try {
          this.running = JSON.parse(raw);
        } catch {
          localStorage.removeItem(RUNNING_KEY);
        }
      }
      try {
        this.tasks = await taskApi.list_mine();
      } catch {
        /* offline */
      }
    },

    async start(task: string) {
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();
      const clientSessionId = uuid();

      if (sync.isOnline) {
        try {
          const r = await taskApi.start_timer({
            task,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            address: null,
            timestamp,
          });
          this.running = {
            clientSessionId,
            serverSessionId: r.session_id,
            task,
            startedAt: timestamp,
          };
          localStorage.setItem(RUNNING_KEY, JSON.stringify(this.running));
          await hapticMedium();
          return { mode: "online" as const };
        } catch {
          /* fall through */
        }
      }

      await saveItem(
        "task_timer_start",
        `start:${clientSessionId}`,
        {
          clientSessionId,
          task,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: null,
          timestamp,
        },
        [],
      );
      this.running = { clientSessionId, serverSessionId: null, task, startedAt: timestamp };
      localStorage.setItem(RUNNING_KEY, JSON.stringify(this.running));
      await hapticMedium();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async stop() {
      if (!this.running) return;
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();

      if (sync.isOnline && this.running.serverSessionId) {
        try {
          await taskApi.stop_timer({
            session_id: this.running.serverSessionId,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            address: null,
            timestamp,
          });
          await this.clearRunning();
          await hapticMedium();
          return { mode: "online" as const };
        } catch {
          /* fall through */
        }
      }

      await saveItem(
        "task_timer_stop",
        `stop:${this.running.clientSessionId}`,
        {
          clientSessionId: this.running.clientSessionId,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: null,
          timestamp,
        },
        [],
      );
      await this.clearRunning();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async clearRunning() {
      this.running = null;
      localStorage.removeItem(RUNNING_KEY);
    },

    elapsed(): string {
      if (!this.running) return "00:00:00";
      const ms = Math.max(0, Date.now() - Date.parse(this.running.startedAt));
      const total = Math.floor(ms / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },
  },
});
