import { defineStore } from "pinia";
import { announcementApi, type AnnouncementRow } from "@/api/announcement";
import { openDb, STORE } from "@/offline/db";

const keyFor = (user: string, name: string) => `announcement:read:${user}:${name}`;

export const useAnnouncementStore = defineStore("announcement", {
  state: () => ({
    feed: [] as AnnouncementRow[],
    user: "" as string,
  }),
  actions: {
    async load(user: string) {
      this.user = user;
      try {
        this.feed = await announcementApi.feed();
      } catch {
        /* offline */
      }
    },
    async markRead(name: string) {
      const db = await openDb();
      await db.put(STORE.cache, true, keyFor(this.user, name));
    },
    async isRead(name: string): Promise<boolean> {
      const db = await openDb();
      return Boolean(await db.get(STORE.cache, keyFor(this.user, name)));
    },
  },
});
