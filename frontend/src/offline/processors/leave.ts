import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";

registerProcessor("leave", async (entry: QueueRecord) => {
  const p = entry.payload as {
    leave_type: string;
    from_date: string;
    to_date: string;
    half_day: 0 | 1;
    reason: string;
  };
  await apiCall("POST", "fatehhr.api.leave.apply", p);
});
