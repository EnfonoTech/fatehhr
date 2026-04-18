import { defineStore } from "pinia";
import { meApi, type Profile } from "@/api/me";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";

export const useProfileStore = defineStore("profile", {
  state: () => ({ profile: null as Profile | null }),
  actions: {
    async load() {
      try {
        this.profile = await meApi.profile();
      } catch {
        /* offline */
      }
    },
    async update(patch: Partial<Profile>) {
      const sync = useSyncStore();
      if (sync.isOnline) {
        try {
          await meApi.updateProfile(patch);
          await this.load();
          return { mode: "online" as const };
        } catch {
          /* fall through */
        }
      }
      await saveItem("profile_update", `profile:${uuid()}`, patch, []);
      if (this.profile) this.profile = { ...this.profile, ...patch };
      await sync.refresh();
      return { mode: "queued" as const };
    },
  },
});
