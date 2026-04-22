import { defineStore } from "pinia";
import { taskApi, type TaskRow } from "@/api/task";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { useCheckinStore } from "@/stores/checkin";
import { v4 as uuid } from "uuid";
import { getCurrentCoords, hapticMedium } from "@/app/frappe";

interface RunningTimer {
  clientSessionId: string;
  serverSessionId: string | null;
  task: string;
  startedAt: string;
}

const RUNNING_KEY = "fatehhr.runningTimer";
const TASKS_CACHE_KEY = "fatehhr.tasksCache";

function readTasksCache(): TaskRow[] {
  try {
    const raw = localStorage.getItem(TASKS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as TaskRow[]) : [];
  } catch {
    return [];
  }
}

export const useTasksStore = defineStore("tasks", {
  state: () => ({
    // Seed from localStorage so the Tasks tab and Check-In task picker
    // show something immediately on cold start / offline. Refreshes from
    // server when online in `load()`.
    tasks: readTasksCache(),
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
        const fresh = await taskApi.list_mine();
        this.tasks = fresh;
        try {
          localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(fresh));
        } catch {
          /* storage full / disabled — keep in-memory */
        }
      } catch {
        // Offline: keep whatever we hydrated from cache in state().
      }
    },

    async start(task: string) {
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();
      const clientSessionId = uuid();
      // Shared dedupe key across online + offline drain for Timer-mode Checkin.
      const clientId = uuid();

      if (sync.isOnline) {
        try {
          const r = await taskApi.start_timer({
            task,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            address: null,
            timestamp,
            client_id: clientId,
          });
          this.running = {
            clientSessionId,
            serverSessionId: r.session_id,
            task,
            startedAt: timestamp,
          };
          localStorage.setItem(RUNNING_KEY, JSON.stringify(this.running));
          this._syncCheckinStatus("IN", task);
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
          clientId,
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
      this._syncCheckinStatus("IN", task);
      await hapticMedium();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async stop() {
      if (!this.running) return;
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();
      const clientId = uuid();

      if (sync.isOnline && this.running.serverSessionId) {
        try {
          await taskApi.stop_timer({
            session_id: this.running.serverSessionId,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            address: null,
            timestamp,
            client_id: clientId,
          });
          await this.clearRunning();
          this._syncCheckinStatus("OUT", null);
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
          // If the start was online, we know the server session id already.
          // Pass it through so the stop processor doesn't need to look it up
          // in the client→server mapping (which is only written for offline
          // starts). Without this, "online start → offline stop" got stuck
          // on "Session start not yet drained" forever.
          serverSessionId: this.running.serverSessionId,
          clientId,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          address: null,
          timestamp,
        },
        [],
      );
      await this.clearRunning();
      this._syncCheckinStatus("OUT", null);
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async clearRunning() {
      this.running = null;
      localStorage.removeItem(RUNNING_KEY);
    },

    // Keep the checkin store's "currentStatus" in lockstep with whatever
    // the timer just did. Without this, Timer-Mode users would tap
    // Check In / Check Out on the home screen (which reads currentStatus)
    // and see the button stay stale until the next refreshToday fired.
    _syncCheckinStatus(status: "IN" | "OUT", task: string | null) {
      try {
        const checkin = useCheckinStore();
        checkin.currentStatus = status;
        checkin.currentTask = task;
        checkin._persist();
      } catch {
        /* checkin store not ready; next mount will reconcile */
      }
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
