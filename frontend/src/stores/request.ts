import { defineStore } from "pinia";
import { requestApi } from "@/api/request";

/** Home tile: shown only where the cooperheat app provides Service Requests; badge = requests waiting for me. */
export const useRequestStore = defineStore("request", {
  state: () => ({ enabled: false, waiting: 0 }),
  actions: {
    async refresh() {
      try {
        this.enabled = await requestApi.enabled();
        if (this.enabled) this.waiting = (await requestApi.mine()).waiting.length;
      } catch {
        /* offline: keep what we had */
      }
    },
  },
});
