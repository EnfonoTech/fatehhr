import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";
import { uploadPhoto } from "@/offline/photos";
import type { LeaveApplyPayload } from "@/api/leave";

registerProcessor("leave", async (entry: QueueRecord) => {
  const { client_approval_photo_id, ...p } = entry.payload as LeaveApplyPayload & {
    client_approval_photo_id?: string | null;
  };
  // Same single uploader as the online path (idempotent: cached server URL).
  if (!p.client_approval_attachment && client_approval_photo_id) {
    p.client_approval_attachment = await uploadPhoto(client_approval_photo_id, { isPrivate: true });
  }
  await apiCall("POST", "fatehhr.api.leave.apply", p);
});
