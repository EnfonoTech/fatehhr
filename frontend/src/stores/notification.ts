import { defineStore } from "pinia";
import { notificationsApi, type NotificationRow } from "@/api/notifications";

export const useNotificationStore = defineStore("notification", {
  state: () => ({
    rows: [] as NotificationRow[],
    unread: 0,
  }),
  actions: {
    async load() {
      try {
        this.rows = await notificationsApi.feed();
        this.unread = await notificationsApi.unreadCount();
      } catch {
        /* offline */
      }
    },
    async markRead(name: string) {
      try {
        await notificationsApi.markRead(name);
      } catch {
        /* offline */
      }
      const r = this.rows.find((x) => x.name === name);
      if (r && !r.read) {
        r.read = 1;
        this.unread = Math.max(0, this.unread - 1);
      }
    },
  },
});
