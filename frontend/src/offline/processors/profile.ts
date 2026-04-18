import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";

registerProcessor("profile_update", async (entry: QueueRecord) => {
  await apiCall("POST", "fatehhr.api.me.update_profile", entry.payload as Record<string, unknown>);
});
